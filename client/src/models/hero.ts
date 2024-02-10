import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry";
import * as THREE from "three";
import {AnimationAction, AnimationMixer, Scene} from "three";
import { CapsuleInfo } from "../types/main";
import {loadModel} from "../utils/model.ts";
import {Object3D} from "three/src/core/Object3D";
import {ObjectDimensions} from "../../../types/assets.ts";


export class Hero {
    private root: Object3D;
    protected scene: Scene;
    private mixer: AnimationMixer;
    private static dimensions: ObjectDimensions = {
        width: 1.0,
        height: 1.0,
        depth: 0.2
    };
    public currentAnimation: string;
    private action: AnimationAction;
    private _timeout: number | NodeJS.Timeout | undefined;

    constructor(scene: Scene, object: Object3D|undefined|null) {
        const root = object || this.createRoundedBox();
        this.mixer = new AnimationMixer( root );

        // Play a specific animation
        this.currentAnimation = 'Idle';
        const clip = THREE.AnimationClip.findByName( root.animations, 'Idle' );
        this.action = this.mixer.clipAction( clip );

        if (this.action) {
            this.action.play();
        }

        this.scene = scene;
        this.root = root;
        this.applyCapsuleInfo();
    }
    update(delta: number) {
        this.mixer.update( delta );
    }

    createRoundedBox() {
        const geometry = new RoundedBoxGeometry(
            Hero.dimensions.width, Hero.dimensions.height, Hero.dimensions.depth, 10, 0.5 );
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            wireframe: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry.translate( 0, - 0.5, 0 );

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material.shadowSide = 2;
        return mesh;
    }

    applyCapsuleInfo() {
        if (this.root) {
            // @ts-ignore
            this.root.capsuleInfo = {
                radius: 0.5,
                segment: new THREE.Line3( new THREE.Vector3(), new THREE.Vector3( 0, - 1.0, 0.0 ) )
            } as CapsuleInfo;
        }
    }

    setName(string:string) {
        this.root.name = string;
        return this;
    }

    async reloadFromGltf(file = './assets/characters/mixamo_leonard.glb') {
        const group = await loadModel.gltf(file);

        if (group) {
            this.mixer.stopAllAction();
            if (this.root) {
                this.scene.remove(this.root);
            }
            this.root = group.scene;
            this.root.animations = group.animations;
            this.mixer = new AnimationMixer( this.root );
            this.root.castShadow = true;
            this.root.receiveShadow = false;

            this.root.children[0].position.set(0,-1.5,0);
            this.scene.add(this.root);
            this.root.updateMatrixWorld();
        }
        return this;
    }

    static async Create(scene: Scene) {
        const group = await loadModel.gltf('./assets/characters/mixamo_leonard.glb');
        let player = null;
        if (group) {
            player = group.scene;
            player.name = 'Player';
            player.animations = group.animations;
            player.castShadow = true;
            player.receiveShadow = false;

            player.children[0].position.set(0,-1.5,0);
        }
        return new Hero(scene, player);
    }

    getObject() {
        return this.root;
    }

    moveTo(x: number, y: number, z: number) {
        const tempVector = new THREE.Vector3();
        tempVector.set(x, y, z)
        this.root.lookAt(tempVector);
        this.root.position.set(x, y, z)
    }

    timeout(method:Function, ms = 1000) {
        if (this._timeout) {
            clearTimeout(this._timeout);
        }
        this._timeout = setTimeout(()=>{
            method.call(this);
        }, ms);
    }

    addToScene(): Hero {
        this.scene.add(this.root);
        return this;
    }

    getPosition() {
        return this.root.position.clone();
    }

    changeAnimation(name: string) {
        if (this.currentAnimation === name) {
            return;
        }

        const clip = THREE.AnimationClip.findByName( this.root.animations, name );
        if (clip) {
            //this.action.stop();
            this.mixer.stopAllAction();

            const action = this.mixer.clipAction( clip );
            if (action) {
                this.currentAnimation = name;
                action.play();
            } else {
                console.warn('No clip found for ', clip);
            }
        } else {
            console.warn('No clip found for ' + name);
        }
    }
}
