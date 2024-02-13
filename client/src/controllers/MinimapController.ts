import * as THREE from "three";
import {Box3, Euler, OrthographicCamera, Scene, Vector3, WebGLRenderer} from "three";


export class MinimapController {
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;
    private renderer: WebGLRenderer;
    private dimensions: { top: number; left: number; bottom: number; right: number, width: number, height: number };
    constructor(boundingBox?: Box3) {
        const minimapCanvas = document.createElement('canvas');
        minimapCanvas.classList.add('minimap');
        document.body.appendChild(minimapCanvas);

        const mapTexture = new THREE.TextureLoader().load('./assets/scenes/simenai/textures/Simenai_diffuse.jpeg');
        var material = new THREE.SpriteMaterial({ map: mapTexture, color: 0xffffff });
        var sprite = new THREE.Sprite(material);
        sprite.position.set(0,0,0);
        this.scene = new THREE.Scene();
        this.scene.add(sprite);

        this.dimensions = {
            left: boundingBox ? boundingBox.min.x : minimapCanvas.width / -2,
            right: boundingBox ? boundingBox.max.x : minimapCanvas.width / 2,
            top: boundingBox ? boundingBox.max.z : minimapCanvas.height / 2,
            bottom: boundingBox ? boundingBox.min.z : minimapCanvas.height / -2,
            width: boundingBox ? boundingBox.max.x - boundingBox.min.x : minimapCanvas.width,
            height: boundingBox ? boundingBox.max.z - boundingBox.min.z : minimapCanvas.height
        };

        this.camera = new THREE.OrthographicCamera(
            this.dimensions.left, // left
            this.dimensions.right, // right
            this.dimensions.top, // top
            this.dimensions.bottom, // bottom
            1, // near
            2000 // far
        );
        this.camera.up.set(0,1,0);
        this.camera.position.set(0, 10, 0); // Set camera position
        this.camera.lookAt(0, 0, 0); // Look at the center
        this.camera.zoom = 8;

        this.renderer = new THREE.WebGLRenderer({ canvas: minimapCanvas });
        //this.renderer.setSize(this.dimensions.width, this.dimensions.height);
        sprite.scale.set(this.dimensions.width, this.dimensions.height, 1);
    }
    
    update(position?: Vector3, rotation?: Euler) {
        if (position) {
            //const vector2D = position.clone().project(this.camera); // Assuming `camera` is your orthographic camera

            this.camera.position.set(position.x, 15, position.z);
            this.camera.lookAt(position.x, 0, position.z);
        }
        if (rotation) {

        }
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
    }
}