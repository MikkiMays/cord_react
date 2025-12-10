// src/config/mediaProfiles.js

export const VIDEO_PROFILES = {
    low: {
      constraints: {
        width: { ideal: 426, max: 426 },
        height: { ideal: 240, max: 240 },
        frameRate: { ideal: 12, max: 15 },
      },
      maxBitrate: 200_000,
    },
    med: {
      constraints: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 20, max: 24 },
      },
      maxBitrate: 450_000,
    },
    hd: {
      constraints: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      maxBitrate: 1_200_000,
    },
    // ВРЕМЕННО: 1080p 60fps для тестирования
    fullhd: {
      constraints: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, max: 60 },
      },
      maxBitrate: 3_000_000, // 3 Mbps для 1080p 60fps
    },
  };
  