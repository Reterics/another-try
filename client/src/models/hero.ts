import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry";
import * as THREE from "three";
import {AnimationMixer, Mesh, Scene} from "three";
import { CapsuleInfo } from "../types/main";
import {loadModel} from "../utils/model.ts";
import {Object3D} from "three/src/core/Object3D";


export class Hero {
    private readonly root: Object3D;
    protected scene: Scene;
    private mixer: AnimationMixer;

    constructor(scene: Scene, object: Object3D|undefined|null) {
        const root = object || this.createRoundedBox();
        this.mixer = new AnimationMixer( root );
        const clips = root.animations;

        // Play a specific animation
        const clip = THREE.AnimationClip.findByName( clips, 'rig|rigAction' );
        const action = this.mixer.clipAction( clip );

        if (action) {
            action.play();
        }

        this.scene = scene;
        this.root = root;
    }
    update(delta: number) {
        this.mixer.update( delta );
    }

    createRoundedBox() {
        const geometry = new RoundedBoxGeometry( 1.0, 2.0, 1.0, 10, 0.5 );
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            wireframe: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry.translate( 0, - 0.5, 0 );

        // @ts-ignore
        mesh.capsuleInfo = {
            radius: 0.5,
            segment: new THREE.Line3( new THREE.Vector3(), new THREE.Vector3( 0, - 1.0, 0.0 ) )
        } as CapsuleInfo;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material.shadowSide = 2;
        return mesh;
    }

    static async Create(scene: Scene) {
        const group = await loadModel.fbx('./assets/characters/lpcharacter.fbx');
        if (group) {
            group.traverse((object: Object3D|Mesh) => {
                if (object instanceof Mesh) {
                    object.castShadow = true;
                    object.receiveShadow = false;
                }
            })
        }
        return new Hero(scene, group)
    }

    getObject() {
        return this.root;
    }

    addToScene() {
        this.scene.add(this.root);
    }

    getPosition() {
        return this.root.position.clone();
    }
}
