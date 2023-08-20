import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, MeshBVHVisualizer, StaticGeometryGenerator } from 'three-mesh-bvh';
import {BufferGeometry, Group, Light, Mesh, MeshStandardMaterial, Scene} from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {CapsuleInfo} from "../main";

let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
let tempBox = new THREE.Box3();
let tempMat = new THREE.Matrix4();
let tempSegment = new THREE.Line3();
// let playerVelocity = new THREE.Vector3();
// let upVector = new THREE.Vector3( 0, 1, 0 );
const direction = new THREE.Vector3();
const velocity = new THREE.Vector3();
let timeUntilSprintOptionDisables: Date | undefined | null;

interface MapSegment {
    visualizer: MeshBVHVisualizer;
    collider: Mesh;
    environment: Group;
}

interface MapSegments {
    [key: string]: MapSegment
}

/*function getAzimuthalAngle(controls) {
    return Math.atan2(controls.camera.rotation.x, controls.camera.rotation.z);
}*/
export class GltfScene {
    protected visualizer: MeshBVHVisualizer | undefined;
    protected collider: Mesh;
    protected environment: Group;
    protected mapSegments: MapSegments;
    params = {
        displayCollider: false,
        displayBVH: false,
        visualizeDepth: 10,
        gravity: - 30,
        playerSpeed: 10,
        physicsSteps: 5,
        spawnCoordinates: [15, 1, 1] // X Y Z
    };
    protected scene: Scene;
    private readonly initMethod;
    private loaded = false;
    private controls: PointerLockControls;
    playerIsOnGround = false;
    canJump = false;
    sprinting = false; // Temporary not available
    energy = 10;
    fwdPressed = false; bkdPressed = false; lftPressed = false; rgtPressed = false;
    private readonly energyNode: HTMLProgressElement | null;
    private selectedModel: string;

    constructor(model: string, scene: Scene, controls:PointerLockControls, callback: Function) {
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
        return this;
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    _loadGLTF(callback: Function|undefined): Promise<GltfScene> {
        let targetModel = this.selectedModel.startsWith('https://') || this.selectedModel.startsWith('http://') ?
            this.selectedModel : 'assets/scenes/' + this.selectedModel;
        if (!targetModel.endsWith('.gtlf') && !targetModel.endsWith('.glb')) {
            // Apply Coordinate
            const coordinate = this.controls.camera.position.x + ',' + this.controls.camera.position.y + ',' + this.controls.camera.position.z;
            console.error(coordinate);

            targetModel += '.gltf';
        }
        return new Promise(resolve=> {

            new GLTFLoader().load( targetModel, res => {
                const gltfScene:THREE.Group = res.scene;
                //gltfScene.scale.setScalar( .01 );

                const box = new THREE.Box3();
                box.setFromObject( gltfScene );
                box.getCenter( gltfScene.position ).negate();
                gltfScene.updateMatrixWorld( true );
                // visual geometry setup
                const toMerge = {};
                const toMergeTexture = {};
                this.environment = new THREE.Group();
                // @ts-ignore
                gltfScene.traverse( (c: Mesh|Light) => {

                    // Excludes during loading
                   /* if (
                        /Boss/.test( c.name ) ||
                        /Enemie/.test( c.name ) ||
                        /Shield/.test( c.name ) ||
                        /Sword/.test( c.name ) ||
                        /Character/.test( c.name ) ||
                        /Gate/.test( c.name ) ||

                        // spears
                        /Cube/.test( c.name )
                    ) {
                        return;
                    }*/

                    if (c.isMesh ) {
                        const material:MeshStandardMaterial = c.material as MeshStandardMaterial;
                        let hex = material.color.getHex();
                        if (material.map) {
                            hex = Number(hex.toString() + '999');
                            toMergeTexture[hex] = material;
                        }
                        // @ts-ignore
                        toMerge[ hex ] = toMerge[ hex ] || [];
                        // @ts-ignore
                        toMerge[ hex ].push( c );
                    } else if (c.isLight) {
                        try {
                            this.scene.add( c.clone(true) );
                        } catch (e) {
                            console.error(e);
                        }
                    }
                } );

                for ( const hex in toMerge ) {
                    // @ts-ignore
                    const arr = toMerge[ hex ];
                    const visualGeometries: BufferGeometry[] = [];
                    arr.forEach( (mesh: Mesh) => {
                        const material = mesh.material as MeshStandardMaterial;
                        if ( material.emissive.r !== 0 ) {
                            this.environment.attach( mesh );
                        } else if(mesh.material && mesh.material.type === "MeshStandardMaterial"){
                            //this.environment.add(mesh);

                            const geom = mesh.geometry.clone();
                            geom.applyMatrix4( mesh.matrixWorld );
                            visualGeometries.push( geom );
                        } else {
                            const geom = mesh.geometry.clone();
                            geom.applyMatrix4( mesh.matrixWorld );
                            visualGeometries.push( geom );
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
                const colliderMaterial: MeshStandardMaterial = this.collider.material as MeshStandardMaterial;
                colliderMaterial.wireframe = true;
                colliderMaterial.opacity = 0.5;
                colliderMaterial.transparent = true;

                this.visualizer = new MeshBVHVisualizer( this.collider, this.params.visualizeDepth );

                this.loaded = true;
                if (typeof callback === 'function') {
                    callback(this);
                }
                resolve(this);
            } );
        });
    }

    respawn(camera: THREE.PerspectiveCamera, player: Mesh) {
        player.position.set(
            this.params.spawnCoordinates[0],
            this.params.spawnCoordinates[1],
            this.params.spawnCoordinates[2]);

        velocity.set( 0, 0, 0 );
        camera.position.copy(player.position);
    }
    initPlayerEvents() {
        const self = this;
        window.addEventListener( 'keydown', function ( e ) {

            switch ( e.code ) {

                case 'KeyW':
                    if(!self.fwdPressed) {
                        let now = new Date()

                        if(timeUntilSprintOptionDisables != null && timeUntilSprintOptionDisables > now) {
                            self.sprinting = true; // Temporary not available
                        }

                        now.setSeconds(now.getSeconds() + 1)
                        timeUntilSprintOptionDisables = now
                    }
                    self.fwdPressed = true;

                    break;
                case 'KeyS': self.bkdPressed = true; break;
                case 'KeyD': self.rgtPressed = true; break;
                case 'KeyA': self.lftPressed = true; break;
                case 'Space':
                    self.controls.camera.position.y = 10;
                    if ( self.playerIsOnGround && self.canJump) {
                        velocity.y = 10.0;
                        self.playerIsOnGround = false;
                    }
                    break;

            }

        } );

        window.addEventListener( 'keyup', function ( e ) {
            switch ( e.code ) {
                case 'KeyW': self.fwdPressed = false; break;
                case 'KeyS': self.bkdPressed = false; break;
                case 'KeyD': self.rgtPressed = false; break;
                case 'KeyA': self.lftPressed = false; break;
            }
        } );
    }

    addToScene() {
        if (this.loaded) {
            if (this.visualizer) {
                this.scene.add( this.visualizer );
                this.scene.add( this.collider );
                this.scene.add( this.environment );
            }
        } else {
            this.initMethod.then(()=>{
                if (this.visualizer) {
                    this.scene.add( this.visualizer );
                    this.scene.add( this.collider );
                    this.scene.add( this.environment );
                }
            });
        }
    }

    updatePlayer(delta:number, camera: THREE.PerspectiveCamera, player: Mesh) {
        if (this.collider && camera && player && this.visualizer) {
            this.collider.visible = this.params.displayCollider;
            this.visualizer.visible = this.params.displayBVH;


            /*if ( playerIsOnGround ) {
                playerVelocity.y = delta * this.params.gravity;
            } else {
                playerVelocity.y += delta * this.params.gravity;
            }
            player.position.addScaledVector( playerVelocity, delta );*/

            // move the player
            velocity.x -= velocity.x * this.params.playerSpeed * delta;
            velocity.z -= velocity.z * this.params.playerSpeed * delta;

            //velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

            direction.z = Number( this.fwdPressed ) - Number( this.bkdPressed  );
            direction.x = Number( this.rgtPressed ) - Number( this.lftPressed );
            direction.normalize(); // this ensures consistent movements in all directions

            if ( this.fwdPressed  ||  this.bkdPressed ) velocity.z -= direction.z * 100.0 * delta;
            if ( this.rgtPressed  || this.lftPressed ) velocity.x -= direction.x * 100.0 * delta;

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
                velocity.y = Math.max( 0, velocity.y );
                this.canJump = true;
            } else {
                velocity.y += delta * this.params.gravity;
            }

            this.controls.getObject().position.y += ( velocity.y * delta );

            this.controls.moveRight( - velocity.x * delta /** this.params.playerSpeed*/);
            this.controls.moveForward( - velocity.z * delta /** this.params.playerSpeed*/);
            player.rotation.copy(camera.rotation);
            player.position.copy(camera.position);
            /*const angle = getAzimuthalAngle(this.controls); //this.controls.getAzimuthalAngle(); // Get Azimuth for OrbitControl
            if ( this.fwdPressed ) {
                tempVector.set( 0, 0, - 1 ).applyAxisAngle( upVector, angle );
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );
            }

            if ( this.bkdPressed ) {
                tempVector.set( 0, 0, 1 ).applyAxisAngle( upVector, angle );
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );
            }

            if ( this.lftPressed ) {
                tempVector.set( - 1, 0, 0 ).applyAxisAngle( upVector, angle );
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );
            }

            if ( this.rgtPressed ) {
                tempVector.set( 1, 0, 0 ).applyAxisAngle( upVector, angle );
                player.position.addScaledVector( tempVector, this.params.playerSpeed * delta );

            }*/

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

                    intersectsBounds: (box:any) => box.intersectsBox( tempBox ),

                    intersectsTriangle: (tri:any) => {

                        // check if the triangle is intersecting the capsule and adjust the
                        // capsule position if it is.
                        const triPoint = tempVector;
                        const capsulePoint = tempVector2;

                        const distance = tri.closestPointToSegment( tempSegment, triPoint, capsulePoint );
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
                //velocity.set( 0, 0, 0 );
            }

            // adjust the camera
            camera.position.copy(player.position);

            // if the player has fallen too far below the level reset their position to the start
            if ( player.position.y < - 25 ) {
                this.respawn(camera, player);
            }
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
}
