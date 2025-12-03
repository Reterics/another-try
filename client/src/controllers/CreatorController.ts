import {Mesh, Scene, Object3D, Camera} from "three";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {createShadowObject} from "../utils/model";
import {Active3DMode, ControllerView} from "../types/three";
import { roundToPrecision } from "../utils/math";
import {HUDController} from "./HUDController.ts";
import {Hero} from "../models/hero.ts";
import {AssetObject} from "../../../types/assets";
import {MouseEventLike, ShadowType} from "../types/controller.ts";
import { EventBus, Topics } from "@game/shared";
import type { ObjectPositionMessage } from "../../../types/messages.ts";
import {
    TPS_CAMERA_DISTANCE,
    TPS_CAMERA_FALLBACK_DIR,
    TPS_CAMERA_MAX_DISTANCE,
    TPS_CAMERA_MIN_DISTANCE
} from "../config/camera.ts";

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
    private _shadowLoad?: Promise<ShadowType | null>;
    private _lastMouse: MouseEventLike;
    private readonly bus: EventBus;

    constructor(scene: Scene, hudController: HUDController, hero: Hero, controls: OrbitControls, eventBus: EventBus) {
        this.bus = eventBus;
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
        document.addEventListener('click', this.onClick.bind(this));
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
                "name": "Tree 1"
            },
            {
                "type": "model",
                "path": "assets/models/tree_1.glb",
                "heightMeters": 4,
                "name": "Tree 2"
            },
            {
                "type": "model",
                "path": "assets/models/tree_2.glb",
                "name": "Tree 3"
            },
            {
                "type": "model",
                "path": "assets/models/panel_house.glb",
                "name": "House"
            }
        ];
        this.shadowTypeIndex = 0;
        this.shadowInstances = [];

        this._lastMouse = {
            clientX: window.innerWidth / 2,
            clientY: window.innerHeight / 2
        };
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
        if (this.hud.isChatActive()) {
            return; // Disable all functionality while we're chatting
        }
        const shadow = this.getShadowObject() || {} as Object3D;
        switch (event.code) {
            case 'Digit1':
                this.active = 'pointer';
                shadow.visible = false;
                this.hud.setActiveSide(this.active);
                this.hud.update(null, this);
                break;
            case 'Digit2':
                this.active = 'far';
                shadow.visible = true;
                this.hud.setActiveSide(this.active);
                this.hud.update(null, this);
                break;
            case 'Digit3':
                this.active = 'size';
                shadow.visible = true;
                this.hud.setActiveSide(this.active);
                this.hud.update(null, this);
                break;
            case 'Digit4':
                this.active = 'precision';
                shadow.visible = true;
                this.hud.setActiveSide(this.active);
                this.hud.update(null, this);
                break;
            case 'KeyR':
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
                this.hud.setActiveSide(this.active);
                this.hud.update(null, this);
                break;
            case 'KeyV':
                if (this.view === 'tps') {
                    this.view = 'fps';
                } else {
                    this.view = 'tps';
                }
                this.updateView()
                break;
            case 'KeyE':
                this.shadowTypeIndex++;
                if (!this.shadowTypes[this.shadowTypeIndex]) {
                    this.shadowTypeIndex = 0;
                }
                if (this.shadowObject) {
                    this.scene.remove(this.shadowObject);
                    this.shadowObject = undefined;
                }
                void this.updateShadowObject();
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
                }
                void this.updateShadowObject();

                break;
        }
    }

    update(deltaTime?: number | undefined) {
        const delta = deltaTime || ((performance.now() - prevTime) / 1000);
        if (this.controls && this.controls.enabled) {
            this.hud.update(delta, this);
        }
    }

    getCenterPosition() {
        const domElement = this.controls.domElement as HTMLElement;
        const rect = domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();

        mouse.x = ((rect.width / 2) / rect.width) * 2 - 1;
        mouse.y = -((rect.height / 2) / rect.height) * 2 + 1;

        return mouse;
    }

    getCursorPosition(event: MouseEventLike) {
        const domElement = this.controls.domElement as HTMLElement;
        const rect = domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();

        mouse.x = ((event.clientX) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY) / rect.height) * 2 + 1;

        this._lastMouse = {
            clientX: event.clientX,
            clientY: event.clientY
        };

        return mouse;
    }

    getShadowObject() {
        this.shadowObject = this.shadowObject || this.scene.children
            .find(m => m.name === "shadowObject");
        return this.shadowObject;
    }

    getShadowObjectByIndex (index: number) {
        return createShadowObject(this.shadowTypes[index]);
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
                const loadType = createShadowObject(this.shadowTypes[this.shadowTypeIndex])
                this._shadowLoad = loadType;
                shadowObject = await loadType;
                if (shadowObject) {
                    this.shadowInstances[this.shadowTypeIndex] = shadowObject;
                }
            }

            if (shadowObject) {
                this.scene.add(shadowObject);
                this.shadowObject = shadowObject;
            }

            if (this.shadowObject) {
                this.shadowObject.visible = this.active !== 'pointer';
            }
            this._shadowLoad = undefined;
        }
    }

    getPosition() {
        return this.hero.getPosition()
    }

    dropObject(object: Object3D | undefined, event: MouseEventLike) {
        if (!object) return;

        const camera = this.controls.object as Camera;
        const forward = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(camera.quaternion)
            .normalize();

        const ndc = this.view === "tps"
            ? this.getCursorPosition(event)
            : this.getCenterPosition();

        const rayCaster = new THREE.Raycaster();
        rayCaster.setFromCamera(ndc, camera);

        const targets = this.scene.children.filter(o => {
            if (o === object) return false;

            return o.name === "collider" ||
                    o.name === "plane" ||
                    o.name.startsWith("mesh");
            }
        );

        const hits = rayCaster.intersectObjects(targets, true);

        if (this.view === "fps") {
            let travelDistance = this.far;
            if (hits.length) {
                travelDistance = Math.min(this.far, hits[0].distance);
            }
            object.position.copy(camera.position).addScaledVector(forward, travelDistance);
            if (hits.length && hits[0].object.name !== "plane") {
                this.placeObjectFlushToHit(object, hits[0]);
            }
        } else if (this.view === "tps" && hits[0]) {
            const objectHit = hits.find(h => !["collider", "plane"].includes(h.object.name));
            const primaryHit = objectHit || hits[0];

            object.position.copy(primaryHit.point);

            if (primaryHit.object.name !== 'plane') {
                this.placeObjectFlushToHit(object, primaryHit);
            }
        }

        object.position.x = roundToPrecision(object.position.x, this.precision);
        object.position.y = roundToPrecision(object.position.y, this.precision);
        object.position.z = roundToPrecision(object.position.z, this.precision);
    }

    private placeObjectFlushToHit(object: Object3D, hit: THREE.Intersection) {
        const isMesh = (x: unknown): x is THREE.Mesh => !!x && typeof x === 'object' && (x as { isMesh?: boolean }).isMesh === true;
        const mesh = object as THREE.Mesh;
        const point = hit.point.clone();

        // 1) Surface normal in world space
        const normal = new THREE.Vector3(0, 1, 0); // default up
        if (hit.face) {
            normal.copy(hit.face.normal);
            normal.transformDirection(hit.object.matrixWorld);
            normal.normalize();
        }

        // 2) Object half extents in world space
        let halfExtentAlongNormal = 0.5; // fallback
        if (isMesh(mesh) && mesh.geometry) {
            const geom = mesh.geometry as THREE.BufferGeometry;
            if (!geom.boundingBox) {
                geom.computeBoundingBox();
            }
            if (geom.boundingBox) {
                const size = new THREE.Vector3();
                geom.boundingBox.getSize(size);

                // Apply object scale
                size.multiply(mesh.scale);

                const halfSize = size.multiplyScalar(0.5);

                // Project half extents onto the normal (Manhattan projection)
                halfExtentAlongNormal =
                    Math.abs(normal.x) * halfSize.x +
                    Math.abs(normal.y) * halfSize.y +
                    Math.abs(normal.z) * halfSize.z;
            }
        }

        const epsilon = 0.001;
        const offset = normal.clone().multiplyScalar(halfExtentAlongNormal + epsilon);

        // 3) Final position: hit point + offset
        object.position.copy(point).add(offset);
    }

    onMouseMove (event: MouseEvent) {
        event.preventDefault();
        const shadowObject = this.getShadowObject();
        this.dropObject(shadowObject, event);
    }

    onDblClick (event: MouseEvent) {
        event.preventDefault();
        const shadowObject = this.getShadowObject();
        if (shadowObject) {
            const bulletObject = shadowObject.clone();
            this.scene.add(bulletObject);
            this.dropObject(bulletObject, event);
            bulletObject.name = "mesh_bullet_brick";

            const payload: ObjectPositionMessage = {
                coordinates: bulletObject.position.toArray(),
                asset: this.shadowTypeIndex,
                type: 'object'
            };
            this.bus.publish(Topics.Creator.ObjectPlaced, { message: payload });
        }
    }

    onClick (event: MouseEvent) {
        event.preventDefault()
        this.bus.publish(Topics.Creator.PointerClicked, { mode: this.active });
    }

    getScale() {
        const shadowObject: Mesh = this.getShadowObject() as Mesh;
        if (shadowObject && shadowObject.scale) {
            return shadowObject.scale.x.toFixed(4);
        }
        return "1.0000";
    }

    updateView() {
        const heroObject = this.hero.getObject();
        if (this.view === 'tps') {
            this.controls.maxPolarAngle = Math.PI / 2;
            // Allow the target distance without being clamped by min/max.
            this.controls.minDistance = Math.min(TPS_CAMERA_MIN_DISTANCE, TPS_CAMERA_DISTANCE);
            this.controls.maxDistance = Math.max(TPS_CAMERA_MAX_DISTANCE, TPS_CAMERA_DISTANCE);
            const targetDistance = TPS_CAMERA_DISTANCE;

            if (!heroObject.visible) {
                heroObject.visible = true;
            }

            const camera = this.controls.object as THREE.PerspectiveCamera;
            this.controls.target.copy(heroObject.position);

            const dir = new THREE.Vector3().subVectors(camera.position, this.controls.target);
            if (dir.lengthSq() < 1e-6) {
                dir.set(TPS_CAMERA_FALLBACK_DIR[0], TPS_CAMERA_FALLBACK_DIR[1], TPS_CAMERA_FALLBACK_DIR[2]).normalize();
            } else {
                dir.normalize();
            }

            camera.position.copy(this.controls.target).addScaledVector(dir, targetDistance);
        } else if (this.view === 'fps') {
            this.controls.maxPolarAngle = Math.PI;
            this.controls.minDistance = 1e-4;
            this.controls.maxDistance = 1e-4;
            if (heroObject.visible) {
                heroObject.visible = false;
            }
        }
    }

    protected _changeFar(delta: number, event?: MouseEventLike) {
        if (this.far <= 1) {
            this.far += delta * 0.1;
        } else if (this.far < 10) {
            this.far += delta;
        } else {
            this.far += delta * 5;
        }
        if (this.far < 0.5) {
            this.far = 0.5;
        }
        const shadowObject = this.getShadowObject();
        const camera = this.controls.object as THREE.PerspectiveCamera;
        if (this.far < 1 && camera.near >= 1) {
            camera.near = 0.1;
            camera.updateProjectionMatrix();
        } else if (this.far >= 1 && camera.near < 1) {
            camera.near = 1;
            camera.updateProjectionMatrix();
        }
        this.dropObject(shadowObject, event || this._lastMouse);
    }

    protected _changeSize(delta: number) {
        const shadowObject: Mesh = this.getShadowObject() as Mesh;
        const currentScale = [shadowObject.scale.x, shadowObject.scale.y, shadowObject.scale.z];
        // Calculate the new scale based on the wheel delta && Clamp the new scale to prevent it from becoming too
        // small or too large
        const clampedScale = currentScale.map(scale => Math.max(0.1,
            Math.min(scale + delta * 0.010, 3)));

        shadowObject.scale.set(clampedScale[0], clampedScale[1], clampedScale[2]);
    }

    protected _changePrecision(delta: number) {
        this.precision += delta;
        if (this.precision < 0) {
            this.precision = 0;
        }
    }

    onScroll (event: WheelEvent) {
        // Normalize wheel delta across different browsers
        const delta = Math.max(-1, Math.min(1, (-event.deltaY || -event.detail)));

        if (this.view === 'fps') {
            if (this.active === 'far') {
                this._changeFar(delta, event);
            } else if (this.active === 'size') {
                this._changeSize(delta);
            } else if (this.active === 'precision') {
                this._changePrecision(delta);
            }
        }

        this.hud.update(null, this);
    }

    dispose() {
        document.removeEventListener('keyup', this.onKeyUp.bind(this));
        document.removeEventListener('dblclick', this.onDblClick.bind(this));
        document.removeEventListener('click', this.onClick.bind(this));
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));
        document.removeEventListener('wheel', this.onScroll.bind(this));
        this.controls.dispose();
    }
}
