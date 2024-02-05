import { Mesh, Scene } from "three";
import { Object3D } from "three/src/core/Object3D";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {createShadowObject, isCollisionDetected} from "../utils/model";
import {Active3DMode, ControllerView} from "../types/three";
import { roundToPrecision } from "../utils/math";
import {HUDController} from "./HUDController.ts";
import {Hero} from "../models/hero.ts";
import {AssetObject} from "../../../types/assets";

let prevTime = performance.now();

export class CreatorController {
    controls: OrbitControls;
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
    view: ControllerView;
    shadowTypes: AssetObject[];
    shadowTypeIndex: number;
    shadowInstances: Object3D[];
    private _shadowLoad:  Promise<Object3D>|undefined;

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
        this.view = 'tps';

        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('dblclick', this.onDblClick.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('wheel', this.onScroll.bind(this));
        this.hud = hudController;

        this.shadowTypes = [
            {
                "type": "rect",
                "w": 3,
                "h": 3,
                "name": "Cube"
            },
            {
                "type": "model",
                "path": "assets/models/ship.gltf",
                "name": "Ship"
            },
            {
                "type": "model",
                "path": "assets/models/tree.gltf",
                "name": "Tree"
            }
        ];
        this.shadowTypeIndex = 0;
        this.shadowInstances = [];
    }

    updateAssets(assets: AssetObject[]) {
        this.shadowTypes = [
            {
                "type": "rect",
                "w": 3,
                "h": 3,
                "name": "Cube"
            },
            ...assets
        ];
        this.shadowTypeIndex = 0;
        this.shadowInstances = [];
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
            case 'KeyV':
                if (this.view === 'tps') {
                    this.view = 'fps';
                } else {
                    this.view = 'tps';
                }
                break;
            case 'KeyE':
                this.shadowTypeIndex++;
                if (!this.shadowTypes[this.shadowTypeIndex]) {
                    this.shadowTypeIndex = 0;
                }
                if (this.shadowObject) {
                    this.scene.remove(this.shadowObject);
                    this.shadowObject = undefined;
                    void this.updateShadowObject();
                }
                break;
            case 'KeyQ':
                if (this.shadowTypeIndex === 0) {
                    this.shadowTypeIndex = this.shadowTypes.length - 1;
                } else {
                    this.shadowTypeIndex--;
                }
                if (this.shadowObject) {
                    this.scene.remove(this.shadowObject);
                    this.shadowObject = undefined;
                    void this.updateShadowObject();
                }
                break;
            case 'Escape':
                this.hud.renderPauseMenu();
        }
    }

    update(deltaTime?: number | undefined) {
        const delta = deltaTime || ((performance.now() - prevTime) / 1000);
        if (this.controls && this.controls.enabled) {
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

    async updateShadowObject() {
        this.shadowObject = this.scene.children
            .find(m => m.name === "shadowObject");
        if (this.shadowObject) {
            this.shadowObject.visible = this.active !== 'pointer';
        } else {
            if (this._shadowLoad) {
                return this._shadowLoad;
            }
            let shadowObject;
            if (this.shadowInstances[this.shadowTypeIndex]) {
                shadowObject = this.shadowInstances[this.shadowTypeIndex].clone();
            } else {
                this._shadowLoad = createShadowObject(this.shadowTypes[this.shadowTypeIndex]);
                shadowObject = await this._shadowLoad;
                this.shadowInstances[this.shadowTypeIndex] = shadowObject;
            }

            this.scene.add(shadowObject);
            this.shadowObject = shadowObject;
            if (this.shadowObject) {
                this.shadowObject.visible = this.active !== 'pointer';
            }
            this._shadowLoad = undefined;
        }
    }

    getPosition() {
        return this.hero.getPosition()
    }

    dropObject (object: Object3D|undefined) {
        if (object) {
            const camera = this.controls.object;
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

    onDblClick (event: MouseEvent) {
        event.preventDefault();
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
        const delta = Math.max(-1, Math.min(1, (-event.deltaY || -event.detail)));

        if (this.active === 'far') {
            this.far += delta * 5;
            if (this.far < 10) {
                this.far = 10;
            }
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
        this.controls.dispose();
    }
}