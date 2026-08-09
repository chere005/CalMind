import ExpoModulesCore
import WatchConnectivity

/**
 The JS side calls WatchBridge.push(json) after every store change (src/watch.ts);
 this keeps the latest list and ships it as the application context — the suite's
 phone→watch pattern: the watch always gets the newest full list, never a queue.

 The RETURN path (Sean's reversal of the read-only rule, 2026-08-09): the watch
 queues {tick: id} as transferUserInfo — it survives the phone being away — and
 it lands here as an "onTick" event. JS applies it through the same
 reminderToggle the phone's own tap uses, so repeats roll, sync runs, and the
 next push closes the loop by refreshing the watch. Two-device conflicts keep
 the suite's existing rule: last writer wins through the ordinary store.
 */
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onTick")

    OnCreate {
      WatchSession.shared.activate()
      WatchSession.shared.onTick = { [weak self] id in
        self?.sendEvent("onTick", ["id": id])
      }
    }

    Function("push") { (json: String) in
      WatchSession.shared.push(json: json)
    }
  }
}

/// Owns the WCSession: activates once, remembers the latest list, and re-sends on
/// (re)activation so a push made while the session was cold still arrives.
final class WatchSession: NSObject, WCSessionDelegate {
  static let shared = WatchSession()
  private var pending: String?
  var onTick: ((String) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func push(json: String) {
    pending = json
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    try? WCSession.default.updateApplicationContext(["list": json])
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    if let json = pending { push(json: json) }
  }

  /// The watch's queued ticks arrive here — including a batch at once if the
  /// phone was away a while. Main queue: the handler reaches React state.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let id = userInfo["tick"] as? String else { return }
    DispatchQueue.main.async { self.onTick?(id) }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
