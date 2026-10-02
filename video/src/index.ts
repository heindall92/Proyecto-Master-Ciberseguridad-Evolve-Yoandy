import {registerRoot, Composition, AbsoluteFill, useCurrentFrame} from "remotion";
import React from "react";
const T: React.FC = () => { const f = useCurrentFrame(); return React.createElement(AbsoluteFill, {style:{background:"#0b1512",color:"#52b788",fontSize:120,justifyContent:"center",alignItems:"center"}}, "Frame "+f); };
registerRoot(() => React.createElement(Composition, {id:"T", component:T, durationInFrames:60, fps:30, width:1920, height:1080}));
