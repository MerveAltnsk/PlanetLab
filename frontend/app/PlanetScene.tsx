"use client";

import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type PlanetParameters = {
  temperature: number;
  gravity: number;
  atmosphere: number;
  water: number;
};

type PlanetSceneProps = {
  values: PlanetParameters;
  reducedMotion: boolean;
  seed: number;
};

type SurfaceMaps = {
  terrain: Float32Array;
  elevation: Float32Array;
  moisture: Float32Array;
  latitude: Float32Array;
  craterShade: Float32Array;
  craterRim: Float32Array;
  lavaChannels: Float32Array;
  clouds: Float32Array;
};

const textureWidth = 512;
const textureHeight = 256;
const atmosphereLightDirection = new THREE.Vector3(0.45, 0.32, 0.84).normalize();
const gradientDirections = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
] as const;

function hash3(x: number, y: number, z: number, seed: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(seed, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function gradientNoise(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const fade = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);

  const corner = (dx: number, dy: number, dz: number) => {
    const direction = gradientDirections[Math.floor(hash3(ix + dx, iy + dy, iz + dz, seed) * gradientDirections.length) % gradientDirections.length];
    const gx = direction[0] * 0.7071;
    const gy = direction[1] * 0.7071;
    const gz = direction[2] * 0.7071;
    return gx * (fx - dx) + gy * (fy - dy) + gz * (fz - dz);
  };
  const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
  const x00 = mix(corner(0, 0, 0), corner(1, 0, 0), u);
  const x10 = mix(corner(0, 1, 0), corner(1, 1, 0), u);
  const x01 = mix(corner(0, 0, 1), corner(1, 0, 1), u);
  const x11 = mix(corner(0, 1, 1), corner(1, 1, 1), u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w) * 1.65;
}

function fbm(x: number, y: number, z: number, seed: number, octaves = 5) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 31) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / normalization;
}

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSurfaceMaps(seed: number): SurfaceMaps {
  const pixelCount = textureWidth * textureHeight;
  const maps: SurfaceMaps = {
    terrain: new Float32Array(pixelCount),
    elevation: new Float32Array(pixelCount),
    moisture: new Float32Array(pixelCount),
    latitude: new Float32Array(pixelCount),
    craterShade: new Float32Array(pixelCount),
    craterRim: new Float32Array(pixelCount),
    lavaChannels: new Float32Array(pixelCount),
    clouds: new Float32Array(pixelCount),
  };

  const random = seededRandom(seed);
  const craters = Array.from({ length: 22 + Math.floor(random() * 18) }, () => {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(1 - z * z);
    return {
      x: radial * Math.cos(angle),
      y: z,
      z: radial * Math.sin(angle),
      radius: 0.018 + random() * 0.065,
      depth: 0.08 + random() * 0.2,
    };
  });

  for (let y = 0; y < textureHeight; y += 1) {
    const v = y / textureHeight;
    const latitude = (v - 0.5) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    for (let x = 0; x < textureWidth; x += 1) {
      const index = y * textureWidth + x;
      const longitude = (x / textureWidth) * Math.PI * 2;
      const px = cosLatitude * Math.cos(longitude);
      const py = Math.sin(latitude);
      const pz = cosLatitude * Math.sin(longitude);
      const warpX = fbm(px * 1.8 + 11, py * 1.8, pz * 1.8 - 7, seed + 5, 3) * 0.28;
      const warpY = fbm(px * 1.8 - 3, py * 1.8 + 17, pz * 1.8, seed + 17, 3) * 0.28;
      const warpZ = fbm(px * 1.8, py * 1.8 - 9, pz * 1.8 + 23, seed + 29, 3) * 0.28;
      const qx = px + warpX;
      const qy = py + warpY;
      const qz = pz + warpZ;
      const continent = fbm(qx * 2.2, qy * 2.2, qz * 2.2, seed, 5);
      const structure = fbm(qx * 6.5, qy * 6.5, qz * 6.5, seed + 41, 4);
      const fine = fbm(px * 22, py * 22, pz * 22, seed + 71, 3);
      const ridgeNoise = 1 - Math.abs(fbm(qx * 9 + 31, qy * 9, qz * 9 - 13, seed + 83, 4));
      const elevation = continent * 0.74 + structure * 0.2 + ridgeNoise * 0.16 + fine * 0.055;
      const cloudNoise = fbm(px * 3.1 + 43, py * 3.1 - 19, pz * 3.1 + 5, seed + 103, 5);
      const moisture = fbm(px * 2.8 - 7, py * 2.8 + 29, pz * 2.8 - 37, seed + 131, 4);
      const ridges = 1 - Math.abs(fbm(qx * 13, qy * 13, qz * 13, seed + 149, 4));
      const fissureNoise = Math.abs(fbm(qx * 14 + 61, qy * 14, qz * 14 - 23, seed + 173, 3));

      maps.terrain[index] = elevation;
      maps.elevation[index] = THREE.MathUtils.clamp((elevation + 0.48) * 0.95 + Math.max(0, ridgeNoise - 0.58) * 0.62, 0, 1);
      maps.moisture[index] = moisture;
      maps.latitude[index] = Math.abs(py);
      maps.clouds[index] = THREE.MathUtils.smoothstep(cloudNoise + moisture * 0.24, 0.03, 0.28);
      maps.lavaChannels[index] = (1 - THREE.MathUtils.smoothstep(fissureNoise + ridges * 0.15, 0.035, 0.16)) * THREE.MathUtils.smoothstep(elevation, -0.02, 0.52);

      let craterShade = 0;
      let craterRim = 0;
      for (const crater of craters) {
        const dot = THREE.MathUtils.clamp(px * crater.x + py * crater.y + pz * crater.z, -1, 1);
        const radiusSquared = crater.radius * crater.radius;
        const distanceSquared = Math.max(0, 2 * (1 - dot));
        const normalizedSquared = distanceSquared / radiusSquared;
        if (normalizedSquared < 1) craterShade += crater.depth * (1 - normalizedSquared);
        const rimDistance = Math.abs(Math.sqrt(normalizedSquared) - 0.97);
        if (rimDistance < 0.15) craterRim = Math.max(craterRim, 0.15 * (1 - rimDistance / 0.15));
      }
      maps.craterShade[index] = craterShade;
      maps.craterRim[index] = craterRim;
    }
  }
  return maps;
}

function makeSurfaceTexture(colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) {
  const data = new Uint8Array(textureWidth * textureHeight * 4);
  const texture = new THREE.DataTexture(data, textureWidth, textureHeight, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function updatePlanetTextures(
  textures: { surface: THREE.DataTexture; ocean: THREE.DataTexture; ice: THREE.DataTexture; lava: THREE.DataTexture; roughness: THREE.DataTexture },
  values: PlanetParameters,
  maps: SurfaceMaps,
  seed: number,
) {
  const surface = textures.surface.image.data as Uint8Array;
  const oceanMask = textures.ocean.image.data as Uint8Array;
  const iceMask = textures.ice.image.data as Uint8Array;
  const lavaMap = textures.lava.image.data as Uint8Array;
  const roughnessMap = textures.roughness.image.data as Uint8Array;
  const temperature = values.temperature / 100;
  const gravity = values.gravity / 100;
  const water = values.water / 100;
  const coldBlend = 1 - THREE.MathUtils.smoothstep(temperature, 0.08, 0.43);
  const heatBlend = THREE.MathUtils.smoothstep(temperature, 0.64, 0.9);
  const desertBlend = (1 - coldBlend) * (1 - heatBlend) * (1 - THREE.MathUtils.smoothstep(water, 0.2, 0.72));
  const activeWater = THREE.MathUtils.smoothstep(water, 0.015, 0.52) * (1 - coldBlend * 0.9);
  const oceanThreshold = -0.32 + water * 0.52;
  const coldLand = new THREE.Color("#c7d8dc");
  const temperateLand = new THREE.Color(seedPalette(seed, "#687356", "#9a805f", "#8573a0"));
  const desertLand = new THREE.Color("#a96842");
  const volcanicLand = new THREE.Color("#282322");
  const coldOcean = new THREE.Color("#7398aa");
  const temperateOcean = new THREE.Color("#173c51");
  const hotOcean = new THREE.Color("#452f32");
  const iceColor = new THREE.Color("#e4f0f1");
  const lavaColor = new THREE.Color("#ff7a27");
  const vegetationColor = new THREE.Color("#83906c");
  const coastColor = new THREE.Color("#d5bb8b");
  const highlandColor = new THREE.Color("#9a6c50");
  const exoticColor = new THREE.Color("#75648a");
  const exoticOcean = new THREE.Color("#285b61");
  const land = new THREE.Color();
  const ocean = new THREE.Color();
  const color = new THREE.Color();
  const exoticPalette = (seed % 5) === 2;

  for (let index = 0; index < maps.terrain.length; index += 1) {
    const pixel = index * 4;
    const terrain = maps.terrain[index];
    const elevation = maps.elevation[index];
    const moisture = maps.moisture[index];
    const oceanCoverage = activeWater * (1 - THREE.MathUtils.smoothstep(terrain, oceanThreshold - 0.1, oceanThreshold + 0.12));
    const coast = Math.exp(-Math.abs(terrain - oceanThreshold) * 26) * (1 - coldBlend * 0.25);
    land.copy(temperateLand);
    land.lerp(desertLand, desertBlend);
    land.lerp(coldLand, coldBlend * THREE.MathUtils.smoothstep(elevation, 0.18, 0.84));
    land.lerp(volcanicLand, heatBlend);
    if (exoticPalette) land.lerp(exoticColor, 0.2 * (1 - coldBlend) * (1 - heatBlend));

    const hillShade = 0.84 + elevation * (0.32 + gravity * 0.54) + maps.craterRim[index] * 0.42 - maps.craterShade[index] * (0.52 + gravity * 0.7);
    land.multiplyScalar(THREE.MathUtils.clamp(hillShade, 0.34, 1.42));
    land.lerp(coastColor, coast * (0.22 + desertBlend * 0.28));
    land.lerp(vegetationColor, THREE.MathUtils.smoothstep(moisture, 0.03, 0.35) * (1 - desertBlend) * (1 - coldBlend) * (1 - heatBlend) * 0.48);
    land.lerp(highlandColor, THREE.MathUtils.smoothstep(elevation, 0.54, 0.85) * (1 - coldBlend) * (1 - heatBlend) * 0.34);

    ocean.copy(temperateOcean);
    ocean.lerp(coldOcean, coldBlend * 0.9);
    ocean.lerp(hotOcean, heatBlend * 0.86);
    if (exoticPalette) ocean.lerp(exoticOcean, 0.32);

    const polar = THREE.MathUtils.smoothstep(maps.latitude[index], 0.66, 0.94);
    const freezeCoverage = THREE.MathUtils.clamp(
      Math.max(coldBlend * (0.55 + elevation * 0.2), polar * (0.38 + coldBlend),
        oceanCoverage * coldBlend * 0.82 + maps.clouds[index] * coldBlend * 0.12),
      0,
      0.96,
    );
    const waterMask = Math.max(oceanCoverage * (1 - freezeCoverage * 0.86), oceanCoverage * coldBlend * 0.25);
    color.copy(land).lerp(ocean, oceanCoverage * (1 - freezeCoverage * 0.72));
    color.lerp(iceColor, freezeCoverage);
    const fineVariation = 0.93 + maps.elevation[index] * 0.1 + maps.moisture[index] * 0.035;
    color.multiplyScalar(fineVariation);
    surface[pixel] = Math.round(linearToSrgb(THREE.MathUtils.clamp(color.r, 0, 1)) * 255);
    surface[pixel + 1] = Math.round(linearToSrgb(THREE.MathUtils.clamp(color.g, 0, 1)) * 255);
    surface[pixel + 2] = Math.round(linearToSrgb(THREE.MathUtils.clamp(color.b, 0, 1)) * 255);
    surface[pixel + 3] = 255;

    const waterValue = Math.round(waterMask * 255);
    oceanMask[pixel] = waterValue;
    oceanMask[pixel + 1] = waterValue;
    oceanMask[pixel + 2] = waterValue;
    oceanMask[pixel + 3] = 255;

    const iceValue = Math.round(freezeCoverage * 255);
    iceMask[pixel] = iceValue;
    iceMask[pixel + 1] = iceValue;
    iceMask[pixel + 2] = iceValue;
    iceMask[pixel + 3] = 255;

    const lava = maps.lavaChannels[index] * heatBlend * (1 - oceanCoverage) * (1 - freezeCoverage);
    lavaMap[pixel] = Math.round(linearToSrgb(lavaColor.r) * 255);
    lavaMap[pixel + 1] = Math.round(linearToSrgb(lavaColor.g) * 255);
    lavaMap[pixel + 2] = Math.round(linearToSrgb(lavaColor.b) * 255);
    lavaMap[pixel + 3] = Math.round(THREE.MathUtils.smoothstep(lava, 0.05, 0.56) * 255);

    const roughness = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(0.9 - elevation * 0.12, 0.22, oceanCoverage) * (1 - freezeCoverage * 0.12),
      0.16,
      0.98,
    );
    const roughnessValue = Math.round(roughness * 255);
    roughnessMap[pixel] = roughnessValue;
    roughnessMap[pixel + 1] = roughnessValue;
    roughnessMap[pixel + 2] = roughnessValue;
    roughnessMap[pixel + 3] = 255;
  }

  Object.values(textures).forEach((texture) => { texture.needsUpdate = true; });
}

function seedPalette(seed: number, temperate: string, desert: string, exotic: string) {
  if (seed % 7 === 2) return exotic;
  if (seed % 5 === 1) return desert;
  return temperate;
}

function linearToSrgb(value: number) {
  return value < 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function makePlanetGeometry() {
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  geometry.userData.basePositions = (geometry.attributes.position.array as Float32Array).slice();
  return geometry;
}

const atmosphereVertexShader = `
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 uColor;
  uniform float uDensity;
  uniform vec3 uLightDirection;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  void main() {
    vec3 normal = normalize(vNormalView);
    vec3 viewDirection = normalize(vViewPosition);
    float viewDot = abs(dot(normal, viewDirection));
    float rim = pow(clamp(1.0 - viewDot, 0.0, 1.0), 2.35);
    float daylight = max(dot(normal, normalize(uLightDirection)), 0.0);
    float nightRim = rim * (1.0 - daylight) * 0.16;
    float alpha = (rim * (0.18 + daylight * 0.82) + nightRim) * uDensity;
    vec3 color = uColor * (0.3 + daylight * 0.95);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Starfield() {
  const geometry = useMemo(() => {
    const random = seededRandom(39017);
    const positions = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index += 1) {
      positions[index * 3] = (random() - 0.5) * 15;
      positions[index * 3 + 1] = (random() - 0.5) * 11;
      positions[index * 3 + 2] = -3 - random() * 8;
    }
    const points = new THREE.BufferGeometry();
    points.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return points;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#bdb8c4" size={0.018} transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function updateCloudTexture(
  texture: THREE.DataTexture,
  maps: SurfaceMaps,
  atmosphere: number,
  temperature: number,
  water: number,
) {
  const pixels = texture.image.data as Uint8Array;
  const air = atmosphere / 100;
  const heat = THREE.MathUtils.smoothstep(temperature / 100, 0.68, 0.92);
  const humidity = THREE.MathUtils.smoothstep(water / 100, 0.08, 0.72);
  const coverage = THREE.MathUtils.clamp((0.08 + air * 0.8) * (0.35 + humidity * 0.65) * (1 - heat * 0.78), 0, 0.9);
  for (let index = 0; index < maps.clouds.length; index += 1) {
    const pixel = index * 4;
    const softMass = THREE.MathUtils.smoothstep(maps.clouds[index], 0.12, 0.72);
    const alpha = Math.round(THREE.MathUtils.clamp((softMass - (1 - coverage) * 0.44) * 1.8, 0, 0.68) * 255);
    pixels[pixel] = 255;
    pixels[pixel + 1] = alpha;
    pixels[pixel + 2] = 230;
    pixels[pixel + 3] = 255;
  }
  texture.needsUpdate = true;
}

function updatePlanetRelief(geometry: THREE.SphereGeometry, maps: SurfaceMaps, gravity: number) {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const original = geometry.userData.basePositions as Float32Array;
  const relief = 0.012 + (1 - gravity / 100) * 0.055;
  for (let i = 0; i < positions.count; i += 1) {
    const x = original[i * 3];
    const y = original[i * 3 + 1];
    const z = original[i * 3 + 2];
    const mapX = Math.min(textureWidth - 1, Math.floor(uv.getX(i) * textureWidth));
    const mapY = Math.min(textureHeight - 1, Math.floor(uv.getY(i) * textureHeight));
    const mapIndex = mapY * textureWidth + mapX;
    const terrainHeight = maps.elevation[mapIndex];
    const craterDepth = maps.craterShade[mapIndex];
    const craterRim = maps.craterRim[mapIndex];
    const displacement = (terrainHeight - 0.42) * relief - craterDepth * relief * 0.42 + craterRim * relief * 0.3;
    const height = Number.isFinite(displacement) ? displacement : 0;
    const factor = 1 + height;
    positions.setXYZ(
      i,
      Number.isFinite(x * factor) ? x * factor : x,
      Number.isFinite(y * factor) ? y * factor : y,
      Number.isFinite(z * factor) ? z * factor : z,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function RotatingPlanet({ values, reducedMotion, seed }: PlanetSceneProps) {
  const group = useRef<THREE.Group>(null);
  const cloudGroup = useRef<THREE.Group>(null);
  const surfaceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const oceanMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const iceMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const lavaMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const cloudMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const surfaceTexture = useMemo(() => makeSurfaceTexture(), []);
  const oceanTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const iceTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const lavaTexture = useMemo(() => makeSurfaceTexture(), []);
  const roughnessTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const cloudTexture = useMemo(() => makeSurfaceTexture(THREE.NoColorSpace), []);
  const geometry = useMemo(() => makePlanetGeometry(), []);
  const surfaceMaps = useMemo(() => createSurfaceMaps(seed), [seed]);

  useEffect(() => {
    updatePlanetTextures(
      { surface: surfaceTexture, ocean: oceanTexture, ice: iceTexture, lava: lavaTexture, roughness: roughnessTexture },
      values,
      surfaceMaps,
      seed,
    );
  }, [iceTexture, lavaTexture, oceanTexture, roughnessTexture, seed, surfaceMaps, surfaceTexture, values]);

  useEffect(() => {
    updateCloudTexture(cloudTexture, surfaceMaps, values.atmosphere, values.temperature, values.water);
  }, [cloudTexture, surfaceMaps, values.atmosphere, values.temperature, values.water]);

  useEffect(() => {
    updatePlanetRelief(geometry, surfaceMaps, values.gravity);
    if (surfaceMaterial.current) {
      surfaceMaterial.current.bumpScale = 0.018 + (1 - values.gravity / 100) * 0.05;
    }
    if (oceanMaterial.current) {
      oceanMaterial.current.roughness = 0.24 - (values.water / 100) * 0.12;
      oceanMaterial.current.clearcoat = 0.35 + (values.water / 100) * 0.5;
    }
  }, [geometry, surfaceMaps, values.gravity, values.water]);

  useEffect(() => {
    const atmosphere = values.atmosphere / 100;
    const temperature = values.temperature / 100;
    if (iceMaterial.current) {
      iceMaterial.current.opacity = 0.12 + (1 - temperature) * 0.56;
      iceMaterial.current.roughness = 0.62 + temperature * 0.12;
    }
    if (lavaMaterial.current) lavaMaterial.current.opacity = 0.72;
    if (cloudMaterial.current) cloudMaterial.current.opacity = 0.22 + atmosphere * 0.48;
  }, [values.atmosphere, values.temperature]);

  useEffect(() => () => {
    [surfaceTexture, oceanTexture, iceTexture, lavaTexture, roughnessTexture, cloudTexture].forEach((texture) => texture.dispose());
    geometry.dispose();
  }, [cloudTexture, geometry, iceTexture, lavaTexture, oceanTexture, roughnessTexture, surfaceTexture]);

  useFrame((_, delta) => {
    if (!reducedMotion) {
      if (group.current) group.current.rotation.y += delta * 0.018;
      if (cloudGroup.current) cloudGroup.current.rotation.y += delta * 0.024;
    }
  });

  const gravity = values.gravity / 100;
  const atmosphere = values.atmosphere / 100;
  const planetScale = 0.97 + gravity * 0.055;
  const atmosphereScale = 1.018 + atmosphere * 0.052;
  const temperature = values.temperature / 100;
  const atmosphereColor = new THREE.Color().setHSL(temperature < 0.36 ? 0.55 : temperature > 0.68 ? 0.075 : 0.59, temperature > 0.68 ? 0.48 : 0.34, 0.68);

  return (
    <group ref={group} scale={planetScale}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          ref={surfaceMaterial}
          map={surfaceTexture}
          bumpMap={surfaceTexture}
          roughnessMap={roughnessTexture}
          bumpScale={0.018 + (1 - gravity) * 0.05}
          roughness={0.88}
          metalness={0.015}
        />
      </mesh>
      <mesh scale={1.003}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshPhysicalMaterial
          ref={oceanMaterial}
          color="#c1d5d8"
          alphaMap={oceanTexture}
          transparent
          opacity={0.82}
          roughness={0.2}
          metalness={0.02}
          clearcoat={0.65}
          clearcoatRoughness={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.006}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial
          ref={iceMaterial}
          color="#edf4f2"
          alphaMap={iceTexture}
          transparent
          opacity={0.3}
          roughness={0.68}
          metalness={0.01}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.008}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshBasicMaterial
          ref={lavaMaterial}
          map={lavaTexture}
          transparent
          opacity={0.72}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group ref={cloudGroup}>
        <mesh scale={1.018}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshStandardMaterial
            ref={cloudMaterial}
            color="#cbd0d0"
            alphaMap={cloudTexture}
            transparent
            opacity={0.42}
            roughness={1}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh scale={atmosphereScale}>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial
          key={seed}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={{
            uColor: { value: atmosphereColor },
            uDensity: { value: atmosphere * 0.74 },
            uLightDirection: { value: atmosphereLightDirection },
          }}
          side={THREE.BackSide}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped
        />
      </mesh>
    </group>
  );
}

function StaticPlanetFallback({ values }: Pick<PlanetSceneProps, "values">) {
  const temperature = values.temperature < 34 ? "frozen" : values.temperature > 66 ? "scorching" : "temperate";
  const gravity = values.gravity < 34 ? "low" : values.gravity > 66 ? "high" : "earth-like";
  const atmosphere = values.atmosphere < 34 ? "thin" : values.atmosphere > 66 ? "dense" : "breathable";
  const water = values.water < 34 ? "none" : values.water > 66 ? "subsurface-oceans" : "surface-oceans";
  return (
    <div
      className="planet-fallback planet-stage"
      role="img"
      aria-label="CSS planet fallback illustration"
      data-temperature={temperature}
      data-gravity={gravity}
      data-atmosphere={atmosphere}
      data-water={water}
      style={{
        "--planet-scale": `${0.94 + values.gravity / 1000}`,
        "--surface-detail": `${0.45 + values.gravity / 250}`,
        "--atmosphere-opacity": `${0.18 + values.atmosphere / 185}`,
        "--atmosphere-width": `${3 + values.atmosphere * 0.12}px`,
        "--water-opacity": `${values.water / 100}`,
        "--temperature-texture": "0.16",
      } as CSSProperties}
    >
      <div className="planet-halo" />
      <div className="atmosphere-layer atmosphere-layer-outer" />
      <div className="atmosphere-layer atmosphere-layer-inner" />
      <div className="planet">
        <div className="planet-atmosphere" />
        <div className="planet-land planet-land-one" />
        <div className="planet-land planet-land-two" />
        <div className="planet-land planet-land-three" />
        <div className="planet-cloud planet-cloud-one" />
        <div className="planet-cloud planet-cloud-two" />
        <div className="planet-water" />
        <div className="planet-surface-cracks" />
        <div className="planet-subsurface" />
        <div className="planet-ice" />
        <div className="planet-shadow" />
        <div className="planet-grain" />
      </div>
      <div className="planet-ring" />
    </div>
  );
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function PlanetScene({ values, reducedMotion, seed }: PlanetSceneProps) {
  const [webglAvailable] = useState(() => {
    if (typeof document === "undefined") return false;
    const testCanvas = document.createElement("canvas");
    const context = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    const supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  });

  if (!webglAvailable) return <StaticPlanetFallback values={values} />;

  return (
    <SceneErrorBoundary fallback={<StaticPlanetFallback values={values} />}>
      <Canvas
        className="planet-canvas"
        dpr={[1, 1.5]}
        resize={{ debounce: 0, scroll: false }}
        camera={{ position: [0, 0, 4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power", toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl, size, camera }) => {
          const measured = gl.domElement.parentElement?.getBoundingClientRect();
          const width = measured?.width || size.width;
          const height = measured?.height || size.height;
          gl.setSize(width, height);
          if (camera instanceof THREE.PerspectiveCamera) {
            camera.aspect = width / Math.max(1, height);
            camera.updateProjectionMatrix();
          }
        }}
        aria-label="Rotating procedural 3D planet"
      >
        <Starfield />
        <ambientLight intensity={0.24} color="#8f9bae" />
        <directionalLight position={[3.5, 2.4, 4]} intensity={2.65} color="#fff1df" castShadow />
        <RotatingPlanet values={values} reducedMotion={reducedMotion} seed={seed} />
      </Canvas>
    </SceneErrorBoundary>
  );
}
