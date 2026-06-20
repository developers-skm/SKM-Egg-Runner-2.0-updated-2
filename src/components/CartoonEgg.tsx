import React from 'react';

interface CartoonEggProps {
  size?: number;
  className?: string;
  interactive?: boolean;
}

export default function CartoonEgg({
  size = 150,
  className = '',
  interactive = true,
}: CartoonEggProps) {
  return (
    <div
      className={`relative select-none flex items-center justify-center ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* Dynamic Keyframe Styles */}
      <style>{`
        @keyframes egg-float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-6px) rotate(1.5deg);
          }
        }
        @keyframes shadow-scale {
          0%, 100% {
            transform: scale(1);
            opacity: 0.25;
          }
          50% {
            transform: scale(0.85);
            opacity: 0.15;
          }
        }
        @keyframes arm-wave {
          0%, 100% {
            transform: rotate(-8deg);
          }
          50% {
            transform: rotate(18deg);
          }
        }
        @keyframes arm-wave-fast {
          0%, 100% {
            transform: rotate(-15deg);
          }
          50% {
            transform: rotate(25deg);
          }
        }
        .egg-mascot-container {
          animation: egg-float 3s ease-in-out infinite;
        }
        .egg-shadow {
          animation: shadow-scale 3s ease-in-out infinite;
        }
        .waving-arm-group {
          animation: arm-wave 0.8s ease-in-out infinite;
          transform-origin: 10px 45px;
        }
        .egg-mascot-container:hover .waving-arm-group {
          animation: arm-wave-fast 0.4s ease-in-out infinite;
        }
      `}</style>

      {/* Main Egg Mascot Container */}
      <div className="egg-mascot-container relative w-full h-full flex items-center justify-center">
        {/* Base Mascot PNG Image */}
        <img
          src="/THUMBS_POSE__Egg_-removebg-preview.png"
          alt="SKM Egg Mascot"
          className="w-[85%] h-[85%] object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
        />

        {/* 
          Overlay Waving Arm & Hand:
          Positioned on the character's right side (viewer's left or right depending on the face).
          Since it's THUMBS_POSE, the thumbs-up hand is on the viewer's right (egg's left), 
          so we add the waving right hand on the viewer's right or left to wave "hi".
          Let's place a waving arm on the right side (viewer's right, egg's left) 
          overlapping the thumbs up, making it look like it's waving its hand enthusiastically!
        */}
        <div
          className="absolute"
          style={{
            bottom: '40%',
            right: '2%',
            width: `${size * 0.35}px`,
            height: `${size * 0.35}px`,
            zIndex: 10,
          }}
        >
          <svg
            viewBox="0 0 80 80"
            className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
          >
            {/* Waving Arm Group with Origin at the shoulder (bottom-left area of SVG) */}
            <g className="waving-arm-group">
              {/* Sleeve/Shoulder joint */}
              <circle cx="10" cy="45" r="7" fill="#DC2626" stroke="#450a0a" strokeWidth="2.5" />
              
              {/* Arm Line (Yellow sleeve / White glove) */}
              <path
                d="M 10 45 Q 25 25 45 20"
                fill="none"
                stroke="#FBBF24"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 10 45 Q 25 25 45 20"
                fill="none"
                stroke="#DC2626"
                strokeWidth="5"
                strokeLinecap="round"
              />

              {/* White Glove (Hand) */}
              {/* Wrist Cuff */}
              <rect x="38" y="12" width="10" height="12" rx="3" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" transform="rotate(-15 43 18)" />
              
              {/* Palm */}
              <circle cx="50" cy="18" r="8" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
              
              {/* Fingers waving */}
              {/* Thumb */}
              <path d="M 43 21 C 41 26 46 29 48 24 Z" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
              {/* Index */}
              <path d="M 52 11 Q 55 2 58 5 Q 55 12 52 11" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
              {/* Middle */}
              <path d="M 56 14 Q 61 6 63 9 Q 58 17 56 14" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
              {/* Ring */}
              <path d="M 58 18 Q 63 11 65 14 Q 59 20 58 18" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
              {/* Pinky */}
              <path d="M 57 22 Q 62 17 64 20 Q 58 24 57 22" fill="#FFFFFF" stroke="#450a0a" strokeWidth="2" />
            </g>
          </svg>
        </div>
      </div>

      {/* Ground Shadow */}
      <div
        className="egg-shadow absolute bottom-0 left-[15%] right-[15%] h-[8px] rounded-[50%] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 80%)',
        }}
      />
    </div>
  );
}
