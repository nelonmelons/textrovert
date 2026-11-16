import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

import { Background } from "./components/Background";
import { sceneEdges } from "./components/motion";
import { ChatScene } from "./scenes/ChatScene";
import { Collage } from "./scenes/Collage";
import { Highlight } from "./scenes/Highlight";
import { Outro } from "./scenes/Outro";
import { PlansCard } from "./scenes/PlansCard";
import { TitleCard } from "./scenes/TitleCard";
import { PALETTES, SKINS } from "./theme";
import { computeTimeline } from "./timeline";
import type { ReelProps } from "./types";

const Edges: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={sceneEdges(frame, duration)}>{children}</AbsoluteFill>;
};

export const Reel: React.FC<ReelProps> = (props) => {
  const timeline = useMemo(() => computeTimeline(props), [props]);
  const palette = PALETTES[props.episode.mood] ?? PALETTES.chill;
  const skin = SKINS[props.chat.platform] ?? SKINS.other;
  return (
    <AbsoluteFill>
      <Background palette={palette} />
      {timeline.scenes.map((scene, i) => {
        let body: React.ReactNode;
        switch (scene.kind) {
          case "title":
            body = <TitleCard props={props} palette={palette} skin={skin} duration={scene.duration} />;
            break;
          case "chat":
            body = <ChatScene props={props} beats={timeline.beats} highlights={timeline.highlights} chatFrom={scene.chatFrom} skin={skin} palette={palette} />;
            break;
          case "highlight": {
            const message = props.messages.find((m) => m.id === scene.messageId)!;
            const person = props.participants.find((p) => p.name === message.sender) ?? { name: message.sender, color: palette.accent, isMe: message.isMe };
            body = <Highlight message={message} person={person} palette={palette} timeZone={props.episode.timeZone} duration={scene.duration} />;
            break;
          }
          case "plans":
            body = <PlansCard plans={props.plans} palette={palette} />;
            break;
          case "collage":
            body = <Collage photos={props.photos} palette={palette} />;
            break;
          case "outro":
            body = <Outro props={props} palette={palette} duration={scene.duration} />;
            break;
        }
        return (
          <Sequence key={i} from={scene.from} durationInFrames={scene.duration} name={scene.kind}>
            {scene.kind === "outro" ? body : <Edges duration={scene.duration}>{body}</Edges>}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
