import ExpoModulesCore
import UIKit
import Network
import CryptoKit

/**
 The link between this device and the others on the local network: Bonjour to
 find them, TLS on a shared passphrase to trust them, and nothing else. No
 server is involved and none can be — there is no address to configure.

 THIS MODULE IS A DUMB PIPE. It carries opaque JSON strings and never learns
 what a record is: every merge rule lives in `@calmind/core`, which is the same
 code the web and the phone already agree on. A second copy of last-write-wins
 in Swift is exactly the kind of thing that drifts from the first and is only
 noticed when two devices disagree.

 The shape is deliberately not a sync protocol. There is no cursor and no "who
 is authoritative", because with a last-write-wins merge that is idempotent and
 commutative, handing a peer records IS the whole algorithm: on connect each
 side sends everything, and after that each sends what changed. Order does not
 matter and a message that arrives twice does nothing.
 */
public class PeerSyncModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PeerSync")

    Events("onRecords", "onPeers", "onState")

    /// What the other devices should call this one. UIDevice's name is the
    /// user's own ("Sean's iPhone"), and on a Mac running the iPad build it is
    /// the Mac's name — which is exactly what tells the three apart in a list.
    Constants([
      "deviceName": UIDevice.current.name,
    ])

    OnCreate {
      PeerLink.shared.onRecords = { [weak self] json in
        self?.sendEvent("onRecords", ["json": json])
      }
      PeerLink.shared.onPeers = { [weak self] peers in
        self?.sendEvent("onPeers", ["peers": peers])
      }
      PeerLink.shared.onState = { [weak self] state, detail in
        self?.sendEvent("onState", ["state": state, "detail": detail])
      }
    }

    /// Begin listening and browsing. Safe to call again — a changed passphrase
    /// restarts the link, since every existing connection is on the old key.
    Function("start") { (passphrase: String, deviceId: String, deviceName: String) in
      PeerLink.shared.start(passphrase: passphrase, deviceId: deviceId, deviceName: deviceName)
    }

    Function("stop") {
      PeerLink.shared.stop()
    }

    /// Hand this JSON to every connected peer. The caller decides what is in
    /// it; this only decides that it arrives whole.
    Function("send") { (json: String) in
      PeerLink.shared.send(json)
    }

    /// Everything this device holds, for a peer that has just appeared. The JS
    /// side answers `onPeers` with it.
    Function("sendTo") { (peerId: String, json: String) in
      PeerLink.shared.send(json, to: peerId)
    }

    Function("peers") { () -> [[String: String]] in
      PeerLink.shared.peerList()
    }
  }
}

// MARK: - Framing

/**
 Length-prefixed framing: four bytes of big-endian length, then the body.

 A stream has no message boundaries of its own, and "one JSON object per read"
 is wrong the first time a store is big enough to arrive in two pieces — which
 is exactly the size at which it starts to matter, on the devices with the most
 to lose.
 */
struct Framer {
  private var buffer = Data()

  static func frame(_ body: Data) -> Data {
    var out = withUnsafeBytes(of: UInt32(body.count).bigEndian) { Data($0) }
    out.append(body)
    return out
  }

  /// Feed whatever arrived; take back every COMPLETE message in it. A partial
  /// message stays buffered for the next read.
  mutating func feed(_ data: Data) -> [Data] {
    buffer.append(data)
    var out: [Data] = []
    while buffer.count >= 4 {
      let len = buffer.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
      let total = 4 + Int(len)
      // A length nobody could mean is a desynchronised stream, not a big
      // message. Drop the connection rather than buffering to the moon.
      if len > 64 * 1024 * 1024 { buffer.removeAll(); return out }
      guard buffer.count >= total else { break }
      out.append(buffer.subdata(in: 4..<total))
      buffer.removeSubrange(0..<total)
    }
    return out
  }
}

// MARK: - The link

final class PeerLink {
  static let shared = PeerLink()
  static let serviceType = "_calmind-local._tcp"

  var onRecords: ((String) -> Void)?
  var onPeers: (([[String: String]]) -> Void)?
  var onState: ((String, String) -> Void)?

  private final class Link {
    let connection: NWConnection
    var peerId: String?
    var peerName: String?
    var framer = Framer()
    init(_ c: NWConnection) { connection = c }
  }

  /// Every piece of state below is touched only on this queue.
  private let q = DispatchQueue(label: "calmind.local.peer")
  private var listener: NWListener?
  private var browser: NWBrowser?
  private var links: [String: Link] = [:]
  private var found: Set<NWBrowser.Result> = []
  private var sweep: DispatchSourceTimer?
  private var passphrase = ""
  private var deviceId = ""
  private var deviceName = ""

  // MARK: Lifecycle

  func start(passphrase: String, deviceId: String, deviceName: String) {
    q.async {
      if self.listener != nil && self.passphrase == passphrase && self.deviceId == deviceId { return }
      self.stopLocked()
      self.passphrase = passphrase
      self.deviceId = deviceId
      self.deviceName = deviceName
      self.onState?("starting", "id \(deviceId)")
      self.startListener()
      self.startBrowser()
      self.startSweep()
    }
  }

  func stop() { q.async { self.stopLocked() } }

  private func stopLocked() {
    sweep?.cancel(); sweep = nil
    listener?.cancel(); listener = nil
    browser?.cancel(); browser = nil
    for (_, l) in links { l.connection.cancel() }
    links.removeAll()
    found.removeAll()
    announcePeers()
  }

  // MARK: Transport

  /**
   TLS with a pre-shared key derived from the passphrase.

   A listener on the local network with no authentication hands the user's whole
   calendar to anyone on the same Wi-Fi, which on a home network is merely bad
   and in a café is the actual threat. A device that does not know the phrase
   fails the handshake and is turned away at the transport, before a single
   record is read.
   */
  private func tlsOptions() -> NWProtocolTLS.Options {
    let opts = NWProtocolTLS.Options()
    let key = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: SymmetricKey(data: Data(passphrase.utf8)),
      salt: Data("calmind-local.v1".utf8),
      info: Data("peer-psk".utf8),
      outputByteCount: 32
    )
    let keyData = key.withUnsafeBytes { Data($0) }
    let identity = Data("calmind-local".utf8)
    keyData.withUnsafeBytes { kb in
      identity.withUnsafeBytes { ib in
        sec_protocol_options_add_pre_shared_key(
          opts.securityProtocolOptions,
          DispatchData(bytes: kb) as __DispatchData,
          DispatchData(bytes: ib) as __DispatchData
        )
      }
    }
    sec_protocol_options_append_tls_ciphersuite(opts.securityProtocolOptions, tls_ciphersuite_t.AES_128_GCM_SHA256)
    /*
     Resumption OFF, and this is a security decision rather than a tuning one.

     TLS 1.3 lets a client skip the handshake by presenting a ticket from an
     earlier session, and the cache those tickets live in is keyed by ENDPOINT,
     not by which key was used. So a second connection to an endpoint somebody
     else has already talked to can come up ready without ever proving it knows
     the passphrase.

     This was measured, not imagined: with resumption on, a peer holding the
     WRONG phrase got the store roughly one run in four — always and only after
     a legitimate link to that same endpoint had gone up first. "The handshake
     was skipped" and "the key was checked" must not be able to be true at once,
     and one extra handshake on a link that connects once and stays up is not a
     cost worth reasoning about.
     */
    sec_protocol_options_set_tls_resumption_enabled(opts.securityProtocolOptions, false)
    sec_protocol_options_set_tls_tickets_enabled(opts.securityProtocolOptions, false)
    return opts
  }

  private func parameters() -> NWParameters {
    let p = NWParameters(tls: tlsOptions(), tcp: NWProtocolTCP.Options())
    // So the link works on a network with no infrastructure, and over AWDL
    // when there is no Wi-Fi to share.
    p.includePeerToPeer = true
    return p
  }

  // MARK: Listening and browsing

  private func startListener() {
    do {
      let l = try NWListener(using: parameters())
      l.service = NWListener.Service(name: deviceId, type: PeerLink.serviceType)
      l.stateUpdateHandler = { [weak self] st in
        switch st {
        case .ready: self?.onState?("listening", "port \(l.port?.rawValue.description ?? "?")")
        // `waiting` on a listener is usually Local Network permission being
        // refused — which otherwise looks EXACTLY like "no other device is
        // running", a silent nothing whose fix is in Settings and which nobody
        // would guess. It is named rather than swallowed.
        case .waiting(let e): self?.onState?("blocked", PeerLink.explain(e))
        case .failed(let e): self?.onState?("failed", PeerLink.explain(e))
        default: break
        }
      }
      l.newConnectionHandler = { [weak self] conn in
        self?.q.async { self?.adopt(conn) }
      }
      l.start(queue: q)
      listener = l
    } catch {
      onState?("failed", error.localizedDescription)
    }
  }

  private func startBrowser() {
    let b = NWBrowser(for: .bonjour(type: PeerLink.serviceType, domain: nil), using: parameters())
    b.stateUpdateHandler = { [weak self] st in
      if case .failed(let e) = st { self?.onState?("failed", PeerLink.explain(e)) }
    }
    b.browseResultsChangedHandler = { [weak self] results, _ in
      self?.q.async {
        self?.found = results
        self?.dialMissing()
      }
    }
    b.start(queue: q)
    browser = b
  }

  /**
   Dial anyone discovered that we are not already linked to.

   On a timer as well as on the browser's callback, because
   `browseResultsChangedHandler` only fires on a CHANGE: a link that drops while
   the other device keeps advertising produces no browse event at all, so a dial
   driven only by that callback never reconnects. A Mac waking from sleep is
   exactly that case, and it is the ordinary one rather than the exotic one.
   */
  private func startSweep() {
    let t = DispatchSource.makeTimerSource(queue: q)
    t.schedule(deadline: .now() + 5, repeating: 5)
    t.setEventHandler { [weak self] in self?.dialMissing() }
    t.resume()
    sweep = t
  }

  private func dialMissing() {
    for r in found {
      guard case .service(let name, _, _, _) = r.endpoint else { continue }
      // Our own advertisement comes back to us. And only ONE side dials: the
      // device whose id sorts lower. Both dialling works but makes two
      // connections where one is wanted, and deciding it from ids means both
      // sides reach the same answer without negotiating.
      guard name != deviceId, deviceId < name, links[name] == nil else { continue }
      let conn = NWConnection(to: r.endpoint, using: parameters())
      adopt(conn, expecting: name)
    }
  }

  // MARK: Connections

  private func adopt(_ conn: NWConnection, expecting: String? = nil) {
    let link = Link(conn)
    if let expecting { link.peerId = expecting; links[expecting] = link }
    conn.stateUpdateHandler = { [weak self] st in
      guard let self else { return }
      self.q.async {
        switch st {
        case .ready:
          self.sendHello(link)
        case .failed, .cancelled:
          self.drop(link)
        case .waiting:
          // A connection that cannot come up retries for ever on its own,
          // silently. The commonest reasons to be waiting are a peer that has
          // gone away and a peer whose passphrase does not match, and neither
          // is fixed by trying harder — let it go, and let the sweep dial again
          // when there is a reason to.
          self.drop(link)
          conn.cancel()
        default: break
        }
      }
    }
    conn.start(queue: q)
    receive(link)
  }

  private func drop(_ link: Link) {
    guard let id = link.peerId, links[id] === link else { return }
    links.removeValue(forKey: id)
    announcePeers()
  }

  private func receive(_ link: Link) {
    link.connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, error in
      guard let self else { return }
      self.q.async {
        if let data, !data.isEmpty {
          for body in link.framer.feed(data) { self.handle(body, from: link) }
        }
        if done || error != nil {
          self.drop(link)
          return
        }
        self.receive(link)
      }
    }
  }

  // MARK: Protocol

  private struct Frame: Codable {
    var v: Int
    var kind: String        // "hello" | "records"
    var device: String
    var name: String
    var payload: String?
  }

  private func write(_ frame: Frame, to link: Link) {
    guard let body = try? JSONEncoder().encode(frame) else { return }
    link.connection.send(content: Framer.frame(body), completion: .contentProcessed { _ in })
  }

  private func sendHello(_ link: Link) {
    write(Frame(v: 1, kind: "hello", device: deviceId, name: deviceName, payload: nil), to: link)
  }

  private func handle(_ body: Data, from link: Link) {
    guard let frame = try? JSONDecoder().decode(Frame.self, from: body), frame.device != deviceId else { return }
    switch frame.kind {
    case "hello":
      link.peerId = frame.device
      link.peerName = frame.name
      if let existing = links[frame.device], existing !== link {
        // A second connection to a peer we already have: keep the first.
        link.connection.cancel()
        return
      }
      links[frame.device] = link
      announcePeers()
    case "records":
      guard let payload = frame.payload else { return }
      onRecords?(payload)
    default:
      break
    }
  }

  // MARK: Sending

  func send(_ json: String, to peerId: String? = nil) {
    q.async {
      for (id, link) in self.links where peerId == nil || id == peerId {
        guard link.peerId != nil else { continue }
        self.write(Frame(v: 1, kind: "records", device: self.deviceId, name: self.deviceName, payload: json), to: link)
      }
    }
  }

  func peerList() -> [[String: String]] {
    q.sync { links.compactMap { (id, l) in l.peerId == nil ? nil : ["id": id, "name": l.peerName ?? id] } }
  }

  private func announcePeers() {
    let list = links.compactMap { (id, l) -> [String: String]? in
      l.peerId == nil ? nil : ["id": id, "name": l.peerName ?? id]
    }
    onPeers?(list)
  }

  private static func explain(_ error: NWError) -> String {
    switch error {
    case .posix(let code) where code == .EPERM || code == .EACCES:
      return "Local Network access is off for this app. Turn it on in Settings → Privacy & Security → Local Network."
    default:
      return error.localizedDescription
    }
  }
}
