import { useFrame } from "@react-three/fiber";
import { usePlayback } from "./store";

/**
 * Single frame-loop that advances playback progress.
 * Priority = -10 so it runs BEFORE Vehicle (0) and Cameras (10).
 * Frame order: advance → vehicle transform → camera follow.
 */
export function SceneAdvancer() {
  // NOTE: priority MUST be 0. Any non-zero priority disables R3F's automatic
  // render loop (caller becomes responsible for gl.render). Frame order is
  // instead enforced by JSX child order in Sim3DScene:
  //   SceneAdvancer → Vehicle → Cameras.
  useFrame((_, dt) => {
    usePlayback.getState().advance(Math.min(0.1, dt));
  });
  return null;
}
