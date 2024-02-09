import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ExtendedTriangle, MeshBVH, MeshBVHHelper, StaticGeometryGenerator} from 'three-mesh-bvh';
import {Box3, BufferGeometry, Camera, Group, Light, Mesh, MeshStandardMaterial, Object3D, Scene} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {Water} from "three/examples/jsm/objects/Water2";
import {CapsuleInfo, SceneParams} from "../types/main.ts";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {Hero} from "../models/hero.ts";

let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
let tempBox = new THREE.Box3();
let tempMat = new THREE.Matrix4();
let tempSegment = new THREE.Line3();
// let playerVelocity = new THREE.Vector3();
const upVector = new THREE.Vector3( 0, 1, 0 );
//const direction = new THREE.Vector3();
const velocity = new THREE.Vector3();
let timeUntilSprintOptionDisables: Date | undefined | null;

interface MapSegment {
    visualizer: MeshBVHHelper;
    collider: Mesh;
    environment: Group;
}

// @ts-ignore
interface MapSegments {
    [key: string]: MapSegment
}
interface toMergeType {
    [key: number]: (Mesh|Light|undefined)[]
}
interface toMergeTextureType {
    [key: number]: (MeshStandardMaterial|undefined)
}

/*function getAzimuthalAngle(controls) {
    return Math.atan2(controls.camera.rotation.x, controls.camera.rotation.z);
}*/
export class GltfScene {
    protected visualizer: MeshBVHHelper | undefined;
    protected collider: Mesh;
    protected environment: Group;
    params: SceneParams;
    protected scene: Scene;
    private initMethod: Promise<GltfScene>;
    private loaded = false;
    private controls: OrbitControls;
    playerIsOnGround = false;
    canJump = false;
    sprinting = false; // Temporary not available
    energy = 10;
    fwdPressed = false; bkdPressed = false; lftPressed = false; rgtPressed = false;
    private readonly energyNode: HTMLProgressElement | null;
    private selectedModel: string;

    constructor(model: string, scene: Scene, controls:OrbitControls, callback: Function) {
        if (model.startsWith('/')) {
            model = model.substring(1);
        }
        this.scene = scene;
        this.controls = controls;
        this.environment = new THREE.Group();
        this.collider = new THREE.Mesh();
        this.selectedModel = model;
        this.initMethod = this._loadGLTF(callback);

        this.energyNode = document.getElementById("HUD-energy") as HTMLProgressElement;

        this.params = {
            displayCollider: false,
            displayBVH: false,
            visualizeDepth: 10,
            gravity: - 30,
            playerSpeed: 10,
            physicsSteps: 5,  //5
            spawnCoordinates: [12, 15, 120] // X Y Z
        };
        return this;
    }

    static CreateMap(model: string, scene: Scene, controls:OrbitControls): Promise<GltfScene> {
        return new Promise(resolve => {
            new GltfScene(model, scene, controls, resolve);
        })
    }
    setSpawnCoordinates (x: number, y: number, z: number) {
        console.log('Set Spawn ', x, y, z);
        this.params.spawnCoordinates = [x, y, z];
    }

    _loadGLTF(callback: Function|undefined): Promise<GltfScene> {
        let targetModel = this.selectedModel.startsWith('https://') || this.selectedModel.startsWith('http://') ?
            this.selectedModel : 'assets/scenes/' + this.selectedModel;
        if (!targetModel.endsWith('.gtlf') && !targetModel.endsWith('.glb')) {
            targetModel += '.gltf';
        }
        return new Promise(resolve=> {

            new GLTFLoader().load( targetModel, res => {
                const gltfScene:THREE.Group = res.scene;
                //gltfScene.scale.setScalar( .01 );

                // const box = new THREE.Box3();
                // box.setFromObject( gltfScene );
                // box.getCenter( gltfScene.position ).negate();
                gltfScene.updateMatrixWorld( true );
                // visual geometry setup
                const toMerge:toMergeType = {};
                const toMergeTexture:toMergeTextureType = {};
                this.environment = new THREE.Group();
                // @ts-ignore
                gltfScene.traverse( (c: Mesh|Light|Camera) => {
                    if (c instanceof Mesh && c.isMesh) {
                        const material:MeshStandardMaterial = c.material as MeshStandardMaterial;
                        let hex = material.color.getHex() || 0;
                        if (material.map) {
                            hex = Number(hex.toString() + '999');
                            toMergeTexture[hex] = material;
                        }
                        if (!Array.isArray(toMerge[ hex ])) {
                            toMerge[ hex ] =  [];
                        }
                        toMerge[ hex ].push( c );
                    } else if (c instanceof Light && c.isLight) {
                        // We always need to clone the light, otherwise it fails
                        this.scene.add( c.clone(true) as Object3D);
                    } else if(c instanceof Camera && c.isCamera) {
                        this.setSpawnCoordinates(c.position.x, c.position.y, c.position.z);
                        // this.controls.object.position.copy(c.position);
                    }
                } );

                for ( const hex in toMerge ) {
                    // @ts-ignore
                    const arr = toMerge[ hex ];
                    const visualGeometries: BufferGeometry[] = [];
                    arr.forEach( (element) => {
                        if (element) {
                            const mesh = element as Mesh;
                            const material = mesh.material as MeshStandardMaterial;
                            if ( material.emissive.r !== 0 ) {
                                this.environment.attach( mesh );
                            } else if(material.map) {
                                const geom = mesh.geometry.clone();
                                geom.applyMatrix4( mesh.matrixWorld );
                                const newMesh = new THREE.Mesh( geom, material );
                                newMesh.castShadow = true;
                                newMesh.receiveShadow = true;
                                newMesh.material.shadowSide = 2;
                                newMesh.material.side = THREE.DoubleSide;
                                this.environment.add( newMesh );

                            } else {
                                const geom = mesh.geometry.clone();
                                geom.applyMatrix4( mesh.matrixWorld );
                                visualGeometries.push( geom );
                            }
                        }

                    } );

                    if ( visualGeometries.length ) {
                        const newGeom = BufferGeometryUtils.mergeGeometries(visualGeometries);
                            // BufferGeometryUtils.mergeBufferGeometries( visualGeometries ) ;
                        if (newGeom) {
                            let material;
                            if (toMergeTexture[hex]) {
                                material = toMergeTexture[hex] as MeshStandardMaterial;
                            } else {
                                material = new THREE.MeshStandardMaterial( {
                                    color: parseInt( hex )
                                    , shadowSide: 2 } );
                            }
                            const newMesh = new THREE.Mesh( newGeom, material );
                            newMesh.castShadow = true;
                            newMesh.receiveShadow = true;
                            newMesh.material.shadowSide = 2;
                            newMesh.material.side = THREE.DoubleSide;

                            this.environment.add( newMesh );
                        } else {
                            console.error('Merging visual geometries failed');
                        }
                    } else {
                        console.error('No visual geometries found')
                    }
                }

                const staticGenerator = new StaticGeometryGenerator( this.environment );
                staticGenerator.attributes = [ 'position' ];

                const mergedGeometry = staticGenerator.generate();
                mergedGeometry.boundsTree = new MeshBVH( mergedGeometry );

                this.collider = new THREE.Mesh( mergedGeometry );
                this.collider.name = 'collider';
                const colliderMaterial: MeshStandardMaterial = this.collider.material as MeshStandardMaterial;
                colliderMaterial.wireframe = true;
                colliderMaterial.opacity = 0.5;
                colliderMaterial.transparent = true;

                this.visualizer = new MeshBVHHelper( this.collider, this.params.visualizeDepth );

                this.loaded = true;
                if (typeof callback === 'function') {
                    callback(this);
                }
                resolve(this);
            } );
        });
    }

    respawn(player: Mesh|Object3D) {
        player.position.set(
            this.params.spawnCoordinates[0],
            this.params.spawnCoordinates[1],
            this.params.spawnCoordinates[2]);

        this.controls.object
            .position
            .sub( player.position )
            .normalize()
            .multiplyScalar( 100)
            .add( player.position );

       this.controls.update();
    }
    initPlayerEvents() {
        window.addEventListener( 'keydown', e => {

            switch ( e.code ) {

                case 'KeyW':
                    if(!this.fwdPressed) {
                        const now = new Date()

                        if(timeUntilSprintOptionDisables != null && timeUntilSprintOptionDisables > now) {
                            this.sprinting = true; // Temporary not available
                        }

                        now.setSeconds(now.getSeconds() + 1)
                        timeUntilSprintOptionDisables = now
                    }
                    this.fwdPressed = true;

                    break;
                case 'KeyS': this.bkdPressed = true; break;
                case 'KeyD': this.rgtPressed = true; break;
                case 'KeyA': this.lftPressed = true; break;
                case 'Space':
                    // this.controls.camera.position.y = 10;
                    if ( this.playerIsOnGround && this.canJump) {
                        velocity.y = 10.0;
                        this.playerIsOnGround = false;
                    }
                    break;

            }

        });

        window.addEventListener( 'keyup', e => {
            switch ( e.code ) {
                case 'KeyW': this.fwdPressed = false; break;
                case 'KeyS': this.bkdPressed = false; break;
                case 'KeyD': this.rgtPressed = false; break;
                case 'KeyA': this.lftPressed = false; break;
            }
        });
    }

    addToScene() {
        if (this.loaded) {
            if (this.visualizer && !this.scene.children.find(c=>c===this.visualizer)) {
                this.scene.add( this.visualizer );
                this.scene.add( this.collider );
                this.scene.add( this.environment );
            }
        } else {
            return this.initMethod.then(()=>{
                if (this.visualizer && !this.scene.children.find(c=>c===this.visualizer)) {
                    this.scene.add( this.visualizer );
                    this.scene.add( this.collider );
                    this.scene.add( this.environment );
                }
            });
        }
    }

    updatePlayer(delta:number, camera: THREE.PerspectiveCamera, hero: Hero) {
        const player = hero ? hero.getObject() : null;
        let moving = false;
        if (this.collider && camera && player && this.visualizer) {
            this.collider.visible = this.params.displayCollider;
            this.visualizer.visible = this.params.displayBVH;

            if(this.sprinting) {
                if(this.energy > 0) {
                    velocity.z -= this.params.playerSpeed;
                    this.energy -= 3.00
                }
                else {
                    this.sprinting = false
                }
            }
            else {
                if(this.energy < 20) {
                    this.energy += 0.02
                }
            }

            if (this.energyNode) {
                this.energyNode.innerHTML = Math.round(this.energy).toString();
                this.energyNode.value = this.energy;
            }

            if ( this.playerIsOnGround ) {
                velocity.y = delta * this.params.gravity;
                //velocity.y = Math.max( 0, velocity.y );
                this.canJump = true;
            } else {
                velocity.y += delta * this.params.gravity;
            }


            player.position.addScaledVector( velocity, delta );

            const angle = this.controls.getAzimuthalAngle(); // Get Azimuth for OrbitControl
            tempVector.set(0,0,0);

            if (this.fwdPressed) {
                tempVector.z = -1;
            }

            if (this.bkdPressed) {
                tempVector.z = 1;
            }

            if (this.lftPressed) {
                tempVector.x = -1;
            }

            if (this.rgtPressed) {
                tempVector.x = 1;
            }

            tempVector.normalize();
            tempVector.applyAxisAngle(upVector, angle);

            if (this.fwdPressed || this.bkdPressed || this.lftPressed || this.rgtPressed) {
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );
                player.lookAt(player.position.clone().add(tempVector));
                hero.changeAnimation('Walk');
                moving = true;
            } else {
                hero.changeAnimation(this.playerIsOnGround ? 'Idle' : 'Jump');
            }

            player.updateMatrixWorld();

            // adjust player position based on collisions
            // @ts-ignore
            const capsuleInfo: CapsuleInfo = player["capsuleInfo"] as CapsuleInfo;
            tempBox.makeEmpty();
            tempMat.copy( this.collider.matrixWorld ).invert();
            tempSegment.copy( capsuleInfo.segment );

            // get the position of the capsule in the local space of the collider
            tempSegment.start.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );
            tempSegment.end.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );

            // get the axis aligned bounding box of the capsule
            tempBox.expandByPoint( tempSegment.start );
            tempBox.expandByPoint( tempSegment.end );

            tempBox.min.addScalar( - capsuleInfo.radius );
            tempBox.max.addScalar( capsuleInfo.radius );

            if (this.collider.geometry.boundsTree) {
                this.collider.geometry.boundsTree.shapecast( {

                    intersectsBounds: (box: Box3) => box.intersectsBox( tempBox ),

                    intersectsTriangle: (triangle:ExtendedTriangle) => {

                        // check if the triangle is intersecting the capsule and adjust the
                        // capsule position if it is.
                        const triPoint = tempVector;
                        const capsulePoint = tempVector2;

                        const distance = triangle.closestPointToSegment( tempSegment, triPoint, capsulePoint );
                        if ( distance < capsuleInfo.radius ) {

                            const depth = capsuleInfo.radius - distance;
                            const direction = capsulePoint.sub( triPoint ).normalize();

                            tempSegment.start.addScaledVector( direction, depth );
                            tempSegment.end.addScaledVector( direction, depth );

                        }

                    }

                } );
            }

            // get the adjusted position of the capsule collider in world space after checking
            // triangle collisions and moving it. capsuleInfo.segment.start is assumed to be
            // the origin of the player model.
            const newPosition = tempVector;
            newPosition.copy( tempSegment.start ).applyMatrix4( this.collider.matrixWorld );

            // check how much the collider was moved
            const deltaVector = tempVector2;
            deltaVector.subVectors( newPosition, player.position );

            // if the player was primarily adjusted vertically we assume it's on something we should consider ground
            this.playerIsOnGround = deltaVector.y > Math.abs( delta * velocity.y * 0.25 );

            const offset = Math.max( 0.0, deltaVector.length() - 1e-5 );
            deltaVector.normalize().multiplyScalar( offset );

            // adjust the player model
            player.position.add( deltaVector );

            if ( ! this.playerIsOnGround ) {
                deltaVector.normalize();
                velocity.addScaledVector( deltaVector, - deltaVector.dot( velocity ) );
            } else {
                velocity.set( 0, 0, 0 );
            }

            // adjust the camera
            camera.position.sub( this.controls.target );
            this.controls.target.copy( player.position );
            camera.position.add( player.position );

            // if the player has fallen too far below the level reset their position to the start
            if ( player.position.y < - 500 ) {
                this.respawn(player);
                moving = false;
            }
            return moving;
        }
    }

    updateScene (selectedMap: string): Promise<GltfScene> {
        if (this.selectedModel !== selectedMap && this.visualizer) {
            this.visualizer.clear();
            this.collider.clear();
            this.environment.clear();
            this.scene.remove(this.visualizer);
            this.scene.remove(this.collider);
            this.scene.remove(this.environment);

            this.selectedModel = selectedMap;
            return this._loadGLTF(undefined);
        }
        return new Promise<GltfScene>(resolve => resolve(this));
    }

    addWater (y = -10, flowMapURL = 'textures/water/flowmap_water.png') {
        const textureLoader = new THREE.TextureLoader();
        const waterGeometry = new THREE.PlaneGeometry( 4000, 4000 );
        const flowMap = textureLoader.load(flowMapURL);

        const water = new Water( waterGeometry, {
            scale: 2,
            textureWidth: 1024,
            textureHeight: 1024,
            flowMap: flowMap
        } );

        water.position.y = y;
        water.rotation.x = Math.PI * - 0.5;
        this.scene.add( water );
    }
}
