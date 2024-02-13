import * as THREE from "three";
import {Euler, OrthographicCamera, Scene, Vector3, WebGLRenderer} from "three";


export class MinimapController {
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;
    private renderer: WebGLRenderer;
    constructor() {
        const minimapCanvas = document.createElement('canvas');
        minimapCanvas.classList.add('minimap');
        document.body.appendChild(minimapCanvas);

        const mapTexture = new THREE.TextureLoader().load('./assets/scenes/simenai/textures/Simenai_diffuse.jpeg');
        var material = new THREE.SpriteMaterial({ map: mapTexture, color: 0xffffff });
        var sprite = new THREE.Sprite(material);
        this.scene = new THREE.Scene();
        this.scene.add(sprite);

        this.camera = new THREE.OrthographicCamera(
            minimapCanvas.width / -2, // left
            minimapCanvas.width / 2, // right
            minimapCanvas.height / 2, // top
            minimapCanvas.height / -2, // bottom
            1, // near
            1000 // far
        );
        this.camera.position.set(0, 0, 10); // Set camera position
        this.camera.lookAt(0, 0, 0); // Look at the center

        this.renderer = new THREE.WebGLRenderer({ canvas: minimapCanvas });
        this.renderer.setSize(minimapCanvas.width, minimapCanvas.height);
        sprite.scale.set(minimapCanvas.width, minimapCanvas.height, 1);
    }
    
    update(position?: Vector3, rotation?: Euler) {
        if (position) {
            this.camera.position.copy(position);
        }
        if (rotation) {
            this.camera.rotation.copy(rotation);
        }
        this.renderer.render(this.scene, this.camera);
    }
}