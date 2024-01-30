import { Mesh, Scene } from "three";
import { Object3D } from "three/src/core/Object3D";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isCollisionDetected } from "../utils/model";
import { Active3DMode } from "../types/three";
import { roundToPrecision } from "../utils/math";
import {AssetObject} from "../types/assets";
import {HUDController} from "./HUDController.ts";
import {Hero} from "../models/hero.ts";

let prevTime = performance.now();

export class CreatorController {
    controls: PointerLockControls|OrbitControls;
    private scene: Scene;
    target: null;
    private shadowObject: Object3D | undefined;
    far: number;
    precision: number;
    active: Active3DMode;
    private hud: HUDController;
    assets?: AssetObject[]
    reference?: AssetObject
    private readonly hero;

    constructor(scene: Scene, hudController: HUDController, hero: Hero, controls: OrbitControls) {
        this.controls =  controls;

        const obj = this.controls.object;
        obj.name = "camera";
        this.target = null;
        //obj.up.set(0, 0, 1);

        const cameraInScene = scene.children.find(m=>m.name === "camera");
        if (cameraInScene) {
            // Replace old camera in scene
            scene.remove(cameraInScene)
        }
        scene.add(obj);
        this.scene = scene;
        this.far = 100;
        this.active = 'pointer';
        this.precision = 10;
        this.hero = hero;

        //this.controls.lock();
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('dblclick', this.onDblClick.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('wheel', this.onScroll.bind(this));
        //this.controls.addEventListener('lock', this.updateShadowObject.bind(this));
        this.hud = hudController;
    }

    onKeyUp (event: KeyboardEvent) {
        switch (event.code) {

            case 'KeyR':
                const shadow = this.getShadowObject() || {} as Object3D;
                if (this.active === 'far') {
                    this.active = 'size';
                } else if (this.active === 'size') {
                    this.active = 'precision';
                } else if (this.active === 'precision') {
                    this.active = 'pointer';

                } else if (this.active === 'pointer') {
                    this.active = 'far';
                }
                shadow.visible = this.active !== 'pointer';
                this.hud.update(null, this);
                break;
        }
    }

    update(deltaTime?: number | undefined) {
        const delta = deltaTime || ((performance.now() - prevTime) / 1000);
        if (this.controls &&
            ((this.controls instanceof OrbitControls && this.controls.enabled) ||
            (this.controls instanceof PointerLockControls && this.controls.isLocked))
        ) {
            this.hud.update(delta, this);
        }
    }

    getCursorPosition() {
        const domElement = this.controls.domElement as HTMLElement;
        const rect = domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();

        mouse.x = ((rect.width / 2) / rect.width) * 2 - 1;
        mouse.y = -((rect.height / 2) / rect.height) * 2 + 1;
        return mouse;
    }

    getShadowObject() {
        this.shadowObject = this.shadowObject || this.scene.children
            .find(m => m.name === "shadowObject");
        return this.shadowObject;
    }

    updateShadowObject() {
        this.shadowObject = this.scene.children
            .find(m => m.name === "shadowObject");
        if (this.shadowObject) {
            this.shadowObject.visible = this.active !== 'pointer';
        }
    }

    getPosition() {
        return this.hero.getPosition()
    }

    dropObject (object: Object3D|undefined) {
        if (object) {
            const camera = this.controls instanceof PointerLockControls ?
                this.controls.camera : this.controls.object;
            const movementSpeed = 3; // Adjust the speed as needed
            object.position.copy(camera.position)

            const mouse = this.getCursorPosition();
            const rayCaster = new THREE.Raycaster();
            rayCaster.setFromCamera(mouse, camera);
            const intersectObjects = this.scene.children.filter((mesh: Object3D) =>
                mesh.name.startsWith("mesh") || mesh.name === "plane");
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

            const directionVector = forward.multiplyScalar(movementSpeed);
            rayCaster.set(object.position, forward);
            const intersects = rayCaster.intersectObjects(intersectObjects,
                true);
            const objectsInPath = intersects.map(o=>o.object);


            let i = 0;
            while (!objectsInPath.find(o=> isCollisionDetected(o, object))) {
                object.position.add(directionVector);
                i++;
                if (i >= this.far) {
                    break;
                }
            }

            object.position.x = roundToPrecision(object.position.x, this.precision);
            object.position.y = roundToPrecision(object.position.y, this.precision);
            object.position.z = roundToPrecision(object.position.z, this.precision);
        }
    }

    onMouseMove (event: MouseEvent) {
        event.preventDefault();
        const shadowObject = this.getShadowObject();
        this.dropObject(shadowObject);
    }

    // @ts-ignore
    onDblClick (event: MouseEvent) {
        const shadowObject = this.getShadowObject();
        if (shadowObject) {
            const bulletObject = shadowObject.clone();
            this.scene.add(bulletObject);
            this.dropObject(bulletObject);
            bulletObject.name = "mesh_bullet_brick";
        }
    }

    onScroll (event: WheelEvent) {
        // Normalize wheel delta across different browsers
        // @ts-ignore
        const delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));

        if (this.active === 'far') {
            this.far += delta * 5;
            const shadowObject = this.getShadowObject();
            this.dropObject(shadowObject);
        } else if (this.active === 'size') {
            const shadowObject: Mesh = this.getShadowObject() as Mesh;
            const currentScale = [shadowObject.scale.x, shadowObject.scale.y, shadowObject.scale.z];
            // Calculate the new scale based on the wheel delta && Clamp the new scale to prevent it from becoming too
            // small or too large
            const clampedScale = currentScale.map(scale => Math.max(0.1,
                Math.min(scale + delta * 0.010, 3)));

            shadowObject.scale.set(clampedScale[0], clampedScale[1], clampedScale[2]);
            return; // preventDefault
        } else if (this.active === 'precision') {
            this.precision += delta;
            if (this.precision < 0) {
                this.precision = 0;
            }
        }
        this.hud.update(null, this);
    }

    dispose() {
        document.removeEventListener('keyup', this.onKeyUp.bind(this));
        document.removeEventListener('dblclick', this.onDblClick.bind(this));
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));
        document.removeEventListener('wheel', this.onScroll.bind(this));
        if (this.controls instanceof PointerLockControls) {
            this.controls.removeEventListener('lock', this.updateShadowObject.bind(this));
        }
        this.controls.dispose();
    }

    lock() {
        if (this.controls instanceof PointerLockControls && !this.controls.isLocked) {
            this.controls.lock();
        }
    }
}