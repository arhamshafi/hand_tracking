// HandTracking.jsx
// Step 1: Live webcam + MediaPipe hand landmark detection + basic gesture recognition
//
// DO NOT npm install @mediapipe/hands / camera_utils / drawing_utils.
// Those packages are UMD/global scripts, not proper ES modules, and Vite
// will fail with "does not provide an export named 'default'".
//
// INSTEAD: add these 3 script tags to index.html, right before
// </body> (or inside <head>), BEFORE your <script type="module" src="/src/main.jsx">:
//
//   <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
//
// These expose window.Hands, window.Camera, window.drawConnectors,
// window.drawLandmarks, window.HAND_CONNECTIONS globally, which this
// component reads below. No npm install needed for these 3 packages.
//
// USAGE:
//   import HandTracking from "./HandTracking";
//   <HandTracking onGesture={(gesture) => console.log(gesture)} />
//
// FULLSCREEN NOTE: this version fills the entire browser viewport.
// Make sure your index.css / global CSS has no default body margin, e.g.:
//   * { margin: 0; padding: 0; box-sizing: border-box; }
//   html, body, #root { width: 100%; height: 100%; }
// Otherwise you may see a small scrollbar or white edge around the canvas.

import { useEffect, useRef, useState } from "react";

export default function HandTracking({ onGesture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [gesture, setGesture] = useState("none");
  const [dims, setDims] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Keep canvas the same size as the browser window
  useEffect(() => {
    const handleResize = () =>
      setDims({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!window.Hands || !window.Camera) {
      console.error(
        "MediaPipe scripts not loaded yet. Check the <script> tags in index.html."
      );
      return;
    }

    const hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(onResults);

    function onResults(results) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Mirror horizontally so movement feels natural (like a selfie camera)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
          color: "#00FF99",
          lineWidth: 3,
        });
        window.drawLandmarks(ctx, landmarks, { color: "#FF0055", radius: 4 });

        const detected = detectGesture(landmarks);
        setGesture(detected);
        if (onGesture) onGesture(detected);
      } else {
        setGesture("none");
      }

      ctx.restore();
    }

    // Basic gesture logic using landmark distances
    // Landmark indices reference: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
    function detectGesture(lm) {
      const dist = (a, b) =>
        Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

      const thumbTip = lm[4];
      const indexTip = lm[8];
      const middleTip = lm[12];
      const ringTip = lm[16];
      const pinkyTip = lm[20];
      const wrist = lm[0];

      const pinchDist = dist(thumbTip, indexTip);

      // Pinch: thumb and index tip close together
      if (pinchDist < 0.05) return "pinch";

      // Fist: all fingertips close to wrist
      const avgTipDist =
        [indexTip, middleTip, ringTip, pinkyTip]
          .map((t) => dist(t, wrist))
          .reduce((a, b) => a + b, 0) / 4;
      if (avgTipDist < 0.18) return "fist";

      // Open palm: fingertips far from wrist
      if (avgTipDist > 0.32) return "open_palm";

      // Point: index extended, others curled
      const indexExtended = dist(indexTip, wrist) > 0.28;
      const middleCurled = dist(middleTip, wrist) < 0.2;
      if (indexExtended && middleCurled) return "point";

      return "unknown";
    }

    if (videoRef.current) {
      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          await hands.send({ image: videoRef.current });
        },
        width: 1280,
        height: 720,
      });
      camera.start();
    }

    return () => {
      hands.close();
    };
  }, [onGesture]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        margin: 0,
        overflow: "hidden",
        background: "#000",
      }}
    >
      <video ref={videoRef} style={{ display: "none" }} playsInline />
      <canvas
        ref={canvasRef}
        width={dims.width}
        height={dims.height}
        style={{
          display: "block",
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          padding: "8px 16px",
          background: "rgba(0,0,0,0.6)",
          color: "#0f9",
          fontFamily: "monospace",
          fontSize: 16,
          borderRadius: 8,
          zIndex: 10,
        }}
      >
        Gesture: {gesture}
      </div>
    </div>
  );
}