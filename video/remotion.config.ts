import {Config} from "@remotion/cli/config";

// Renderizado 1080p H.264 con buena calidad para texto de interfaz (CRF bajo, sin croma submuestreado agresivo).
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(20);
Config.setPixelFormat("yuv420p");
Config.setAudioCodec("aac");
Config.setAudioBitrate("192k");
Config.setConcurrency(4);
Config.setOverwriteOutput(true);
