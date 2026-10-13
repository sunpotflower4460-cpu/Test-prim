// First-person double-barrel shotgun, built from primitives and parented to the camera.
import * as THREE from "../vendor/three.module.js";

const BASE = new THREE.Vector3(0.25, -0.235, -0.6);

export function createViewModel(M, camera) {
  const root = new THREE.Group();
  root.position.copy(BASE);
  camera.add(root);

  const add = (geo, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  };

  // Stock and grip.
  const stock = add(new THREE.BoxGeometry(0.07, 0.11, 0.3), M.gunWood, 0, -0.035, 0.2);
  stock.rotation.x = 0.12;
  add(new THREE.BoxGeometry(0.075, 0.12, 0.02), M.blackIron, 0, -0.035, 0.36);
  // Receiver.
  add(new THREE.BoxGeometry(0.06, 0.06, 0.17), M.gunMetal, 0, -0.005, -0.02);
  // Trigger guard and trigger.
  add(new THREE.BoxGeometry(0.02, 0.012, 0.09), M.gunMetal, 0, -0.04, -0.03);
  add(new THREE.BoxGeometry(0.012, 0.03, 0.012), M.gunMetal, 0, -0.03, 0.0);
  // Hammers at the back of the receiver.
  for (const sx of [-0.016, 0.016]) add(new THREE.BoxGeometry(0.01, 0.025, 0.014), M.gunMetal, sx, 0.03, 0.07);

  // Barrel hinge at the front of the receiver. The barrels pivot about it.
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.03, -0.11);
  root.add(pivot);
  const shellSlots = [];
  for (const sx of [-0.018, 0.018]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.62, 12), M.gunMetal);
    b.rotation.x = Math.PI / 2;
    b.position.set(sx, 0, -0.31);
    b.castShadow = true;
    pivot.add(b);
    // Shell visible in the breech when that barrel is loaded.
    const shell = new THREE.Group();
    shell.position.set(sx, 0, -0.03);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.05, 10), M.shellRed);
    hull.rotation.x = Math.PI / 2;
    hull.position.z = -0.03;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0148, 0.0148, 0.018, 10), M.brass);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.0;
    shell.add(hull, cap);
    shell.visible = false;
    pivot.add(shell);
    shellSlots.push(shell);
  }
  // Rib along the top of the barrels, and the forend under them.
  add(new THREE.BoxGeometry(0.012, 0.005, 0.62), M.gunMetal, 0, 0.02, -0.31, pivot);
  add(new THREE.BoxGeometry(0.05, 0.04, 0.22), M.gunWood, 0, -0.04, -0.23, pivot);
  // Muzzle flash, hidden until a shot.
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flash.position.set(0, 0, -0.66);
  flash.scale.set(0.2, 0.2, 1);
  pivot.add(flash);

  let flashT = 0;
  const vm = {
    root,
    update(gun, dt, aspectScale = 1) {
      root.scale.setScalar(aspectScale);
      let open = 0;
      let kick = 0;
      if (gun.state === "reload") {
        const p = 1 - gun.timer / 0.8;
        open = -Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 0.55;
      } else if (gun.state === "recoil") {
        const k = Math.min(1, Math.max(0, gun.timer / 0.55));
        kick = k * k;
      } else if (gun.state === "dry") {
        kick = 0.12 * Math.sin(gun.timer * 60);
      }
      pivot.rotation.x = open + kick * 0.14;
      root.position.copy(BASE);
      root.position.z += kick * 0.05;
      root.position.y += kick * -0.01;
      // Loaded shells follow the chambers (barrel 0 is the left one).
      shellSlots[0].visible = !!gun.chambers[0];
      shellSlots[1].visible = !!gun.chambers[1];
      if (flashT > 0) {
        flashT -= dt;
        const a = Math.max(0, flashT / 0.07);
        flash.material.opacity = a;
        flash.scale.setScalar(0.12 + (1 - a) * 0.14);
      } else {
        flash.material.opacity = 0;
      }
    },
    muzzle() {
      flashT = 0.07;
    }
  };
  return vm;
}
