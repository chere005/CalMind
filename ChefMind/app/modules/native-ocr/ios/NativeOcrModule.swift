import ExpoModulesCore
import Vision
import UIKit

/**
 Reading a recipe card on the phone, with Apple's Vision framework.

 The web path is tesseract.js: a WASM engine and a language pack fetched on
 first use. On a phone that is the wrong trade — Vision is already there, runs
 on the neural engine, and is markedly better at the thing this app actually
 does, which is photographs of printed cards taken at an angle in a kitchen.

 Two Vision settings matter here and both are deliberate:

 - `.accurate`, not `.fast`. A recipe is read once and kept; a fraction of a
   second buys noticeably fewer wrong quantities, and a wrong quantity is the
   failure that costs a cook a dinner.
 - `usesLanguageCorrection = true`. Ingredient lines are ordinary words, and
   correction is what turns 'tabIespoon' into 'tablespoon'.

 Text comes back as observations in no guaranteed reading order, so lines are
 sorted top-to-bottom before they are joined — the parser downstream reads a
 card as a sequence, and shuffled lines would break every heuristic it has.
 */
public class NativeOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeOcr")

    // Async: Vision on a large photo is tens to hundreds of milliseconds and
    // has no business on the JS thread.
    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let image = Self.load(uri) else {
        promise.reject("ocr_image", "Could not open that photo.")
        return
      }
      guard let cg = image.cgImage else {
        promise.reject("ocr_image", "That photo is in a format Vision cannot read.")
        return
      }

      let request = VNRecognizeTextRequest { req, err in
        if let err {
          promise.reject("ocr_failed", err.localizedDescription)
          return
        }
        let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
        // Vision returns observations unordered. A recipe is a SEQUENCE —
        // 'Ingredients' then the list, 'Method' then the steps — so reading
        // order has to be restored or every downstream heuristic misfires.
        // boundingBox origin is bottom-left, hence descending y for top-down.
        let lines = obs
          .sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
          .compactMap { $0.topCandidates(1).first?.string }
        promise.resolve(lines.joined(separator: "\n"))
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      // Explicit rather than inherited: the recipes here are English, and
      // leaving it to the system locale made the result depend on a setting
      // nobody would think to check when the text came back wrong.
      request.recognitionLanguages = ["en-US"]

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        } catch {
          promise.reject("ocr_failed", error.localizedDescription)
        }
      }
    }
  }

  /// The picker hands back file:// URLs, and occasionally a bare path.
  private static func load(_ uri: String) -> UIImage? {
    if let url = URL(string: uri), url.isFileURL, let d = try? Data(contentsOf: url) {
      return UIImage(data: d)
    }
    return UIImage(contentsOfFile: uri)
  }
}
