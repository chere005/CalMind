import ExpoModulesCore
import WatchConnectivity

/**
 The JS side calls WatchBridge.push(json) after every store change (src/watch.ts);
 this keeps the latest list and ships it as the application context — the suite's
 phone→watch pattern: the watch always gets the newest full list, never a queue.
 */
public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    OnCreate {
      WatchSession.shared.activate()
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

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
