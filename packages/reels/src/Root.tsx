import React from "react";
import { Composition } from "remotion";

import demo from "../demo/demo-props.json";
import { Reel } from "./Reel";
import { computeTimeline, FPS, HEIGHT, WIDTH } from "./timeline";
import type { ReelProps } from "./types";

export const COMPOSITION_ID = "MemoryReel";

export const Root: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={Reel}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={computeTimeline(demo as ReelProps).durationInFrames}
    defaultProps={demo as ReelProps}
    calculateMetadata={({ props }) => ({ durationInFrames: computeTimeline(props).durationInFrames })}
  />
);
