import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleSphereProps {
  color?: string;
}

const SphereParticles: React.FC<ParticleSphereProps> = ({ color = '#000000' }) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate 2,500 particles distributed mathematically on a sphere
  const [positions] = useMemo(() => {
    const particleCount = 2500;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 2.0;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    return [positions];
  }, []);

  // useFrame loop for continuous baseline rotation + scroll linking
  useFrame(() => {
    if (pointsRef.current) {
      // Baseline continuous rotation
      pointsRef.current.rotation.y += 0.001;
      pointsRef.current.rotation.x += 0.0005;

      // Scroll response (linked to window.scrollY)
      if (typeof window !== 'undefined') {
        pointsRef.current.rotation.y += window.scrollY * 0.00001;
        pointsRef.current.rotation.z = window.scrollY * 0.0005;
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.035}
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  );
};

export const ParticleSphere: React.FC<ParticleSphereProps> = ({ color = '#000000' }) => {
  return (
    <div className="fixed top-0 left-0 w-full h-full z-[-1] pointer-events-none">
      <Canvas camera={{ position: [0, 0, 4], fov: 75 }} gl={{ alpha: true, antialias: true }}>
        <SphereParticles color={color} />
      </Canvas>
    </div>
  );
};

export default ParticleSphere;
