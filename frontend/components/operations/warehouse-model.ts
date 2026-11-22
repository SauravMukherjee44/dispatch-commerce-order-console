import * as THREE from "three";
import { stations, stages, type Station } from "@/lib/operations";

type Shape = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

export function buildWarehouse() {
  const scene = new THREE.Scene();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const textures: THREE.Texture[] = [];
  const standard = (color: string) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .78 }));
    return materials.get(color)!;
  };

  function block(parent: THREE.Object3D, dimensions: [number, number, number], x: number, y: number, z: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), standard(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent: THREE.Object3D, radius: number, height: number, x: number, y: number, z: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), standard(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function label(parent: THREE.Object3D, text: string, color: string, x: number, z: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(3, 3, 314, 66, 15);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), 160, 37);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .43), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
    }));
    mesh.position.set(x, .103, z);
    mesh.rotation.x = -Math.PI / 2;
    parent.add(mesh);
  }

  function crate(parent: THREE.Object3D, x: number, z: number, y: number, size: number, color: string) {
    const box = block(parent, [size, size * .69, size * .85], x, y + size * .345, z, color);
    block(parent, [size * .25, .023, size * .851], x, y + size * .69, z, "#e8dcff");
    block(parent, [size * .25, size * .68, .018], x, y + size * .34, z + size * .43, "#e8dcff");
    return box;
  }

  const floor = block(scene, [16.45, .24, 9.7], 0, -.155, 0, "#a69bc9");
  floor.castShadow = false;
  const surface = block(scene, [16.56, .10, 9.82], 0, .006, 0, "#e2dcf3");
  surface.castShadow = false;
  const grid = new THREE.GridHelper(16, 24, "#c8bee4", "#d4cae9");
  grid.position.y = .063;
  grid.scale.z = .59;
  scene.add(grid);
  const route = block(scene, [14.35, .025, .105], 0, .066, 2.22, "#aaa0c8");
  route.castShadow = false;
  for (const x of [-5.6, 0, 5.6]) {
    const connector = block(scene, [.095, .023, 5.4], x, .065, -.05, "#bbb0d5");
    connector.castShadow = false;
  }

  const pads = new Map<Station, { mesh: Shape; material: THREE.MeshStandardMaterial }>();
  for (const key of stages) {
    const station = stations[key];
    const tint = new THREE.Color(station.color).lerp(new THREE.Color("#fff"), .49);
    const pad = block(scene, [2.55, .1, 1.54], station.x, .102, station.z, "#ddd5f2");
    pad.material = new THREE.MeshStandardMaterial({ color: tint, roughness: .76 });
    pads.set(key, { mesh: pad, material: pad.material });
    label(scene, station.label, station.color, station.x, station.z + 1.03);
    for (const offset of [-.93, .93]) {
      const marker = block(scene, [.25, .026, .055], station.x + offset, .162, station.z + .6, station.color);
      marker.castShadow = false;
    }
  }

  // Inventory rack with two shelves of cartons.
  const rackX = -5.8;
  for (const x of [rackX - 1.32, rackX + 1.32]) {
    for (const z of [-4.12, -3.08]) block(scene, [.1, 2.47, .11], x, 1.28, z, "#6d589d");
  }
  for (const height of [.3, 1.08, 1.86, 2.48]) {
    block(scene, [2.76, .09, 1.17], rackX, height, -3.6, "#9a84cb");
    if (height === 2.48) continue;
    for (const [index, offset] of [-.94, -.31, .33, .95].entries()) {
      if (index === 3 && height === 1.08) continue;
      crate(scene, rackX + offset, -3.57, height + .045, .49, index % 2 ? "#9473ed" : "#ad9dde");
    }
  }

  // Intake conveyor.
  block(scene, [2.6, .27, .98], -5.6, .48, .75, "#5f527f");
  for (let x = -6.69; x <= -4.4; x += .2) {
    cylinder(scene, .072, .82, x, .63, .75, "#c5bfdd").rotation.x = Math.PI / 2;
  }
  for (const x of [-6.6, -4.59]) block(scene, [.11, .51, .59], x, .29, .75, "#8f83af");

  // Workbench, monitor, and packing materials.
  for (const x of [-1.06, 1.06]) {
    for (const z of [-.61, .62]) block(scene, [.12, .86, .12], x, .45, z, "#776b87");
  }
  block(scene, [2.55, .13, 1.54], 0, .91, 0, "#dea462");
  block(scene, [1.06, .61, .10], .49, 1.45, -.51, "#5f527e");
  block(scene, [.87, .44, .014], .49, 1.46, -.452, "#b6ade8");
  block(scene, [.12, .22, .12], .49, 1.08, -.51, "#5f527e");
  block(scene, [.57, .04, .31], .55, .995, -.1, "#7a6a91");
  crate(scene, -.65, .11, .98, .54, "#ad7ddf");
  cylinder(scene, .13, .10, -1, 1.025, -.36, "#f7dc9e");

  // Holding pallet and a returns sorting bin.
  for (const x of [-.77, -.37, .03, .43, .83]) block(scene, [.26, .13, .88], x, .17, -3.38, "#c3869e");
  crate(scene, -.51, -3.36, .235, .57, "#df9cb4");
  crate(scene, .45, -3.34, .235, .7, "#ca7b9b");
  block(scene, [2.17, .16, .89], 5.38, .15, -3.62, "#b7a8dd");
  for (const x of [4.89, 5.86]) {
    block(scene, [.83, .71, .69], x, .55, -3.62, "#668cd9");
    block(scene, [.91, .12, .77], x, .92, -3.62, "#91abee");
    block(scene, [.36, .09, .026], x, .62, -3.259, "#dce7ff");
  }

  // Loading lane and truck.
  block(scene, [4.02, .032, 2.12], 5.45, .08, -.56, "#c0bdd6").castShadow = false;
  for (const x of [4.08, 5.03, 5.98, 6.93]) {
    block(scene, [.44, .022, .055], x, .103, .32, "#fff1c4").castShadow = false;
  }
  block(scene, [3.26, .22, 1.14], 5.31, .46, -.71, "#4e6470");
  block(scene, [2.01, 1.39, 1.27], 4.77, 1.18, -.71, "#81beaf");
  block(scene, [1.04, .91, 1.13], 6.24, .91, -.71, "#409a83");
  block(scene, [.72, .38, .028], 6.32, 1.12, -.13, "#bdebe6");
  block(scene, [.026, .36, .85], 6.775, 1.12, -.71, "#bdebe6");
  block(scene, [1.54, .078, .018], 4.78, 1.31, -.064, "#c6ecdd");
  for (const x of [4.18, 6.15]) {
    for (const z of [-1.22, -.205]) {
      cylinder(scene, .255, .16, x, .32, z, "#3f394d").rotation.x = Math.PI / 2;
      cylinder(scene, .105, .18, x, .32, z, "#a4a1b4").rotation.x = Math.PI / 2;
    }
  }
  for (const x of [-7.75, 7.74]) for (const z of [-4.45, 4.44]) {
    cylinder(scene, .095, .38, x, .228, z, "#685d83");
    cylinder(scene, .095, .105, x, .41, z, "#ddaf58");
  }

  const parcel = new THREE.Group();
  const carton = crate(parcel, 0, 0, 0, .89, "#794bdc");
  carton.material = new THREE.MeshStandardMaterial({ color: "#794bdc", roughness: .54 });
  block(parcel, [.19, .16, .025], -.23, .28, .39, "#fff2c4");
  const location = new THREE.Mesh(new THREE.OctahedronGeometry(.155),
    new THREE.MeshBasicMaterial({ color: "#5939bc" }));
  location.position.y = 1.22;
  parcel.add(location);
  scene.add(parcel);

  scene.add(new THREE.HemisphereLight("#f8f3ff", "#9690b2", 2.16));
  const sunlight = new THREE.DirectionalLight("#fff8ec", 2);
  sunlight.position.set(-6, 12, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -12;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 12;
  sunlight.shadow.normalBias = .035;
  scene.add(sunlight);

  function highlight(station: Station) {
    for (const [key, { material }] of pads) {
      material.emissive.set(stations[key].color);
      material.emissiveIntensity = key === station ? .25 : 0;
    }
    carton.material.color.set(stations[station].color);
    location.material.color.set(stations[station].color);
  }

  function dispose() {
    const usedMaterials = new Set<THREE.Material>(materials.values());
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => usedMaterials.add(material));
      }
    });
    usedMaterials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    sunlight.shadow.dispose();
  }

  return { scene, parcel, highlight, dispose };
}
