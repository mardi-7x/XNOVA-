import React from 'react';

export const HolographicBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[#030712]">
      {/* Radial Cyan-Blue Core Glow */}
      <div 
        className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[550px] rounded-full blur-[140px] opacity-25"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0, 240, 255, 0.45) 0%, rgba(14, 165, 233, 0.15) 50%, transparent 80%)'
        }}
      />
      
      {/* Secondary Bottom Ambient Glow */}
      <div 
        className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[450px] rounded-full blur-[160px] opacity-15"
        style={{
          background: 'radial-gradient(circle, rgba(2, 132, 199, 0.5) 0%, transparent 70%)'
        }}
      />

      {/* Futuristic Cyber Grid Pattern */}
      <div className="absolute inset-0 holo-grid-bg opacity-30" />

      {/* Scanning Horizontal Beam Effect */}
      <div className="absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-cyan-400/5 to-transparent animate-scanbeam pointer-events-none" />

      {/* Vignette Depth Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#02050e] via-transparent to-[#02050e]/60" />
    </div>
  );
};
