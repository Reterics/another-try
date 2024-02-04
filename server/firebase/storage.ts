import { getDownloadURL, getStorage, ref, uploadBytes, UploadResult, uploadString } from "firebase/storage";
import { app } from "./config";

export const storage = getStorage(app);

export const getFileURL = (path: string): Promise<string> => {
    const storageRef  = ref(storage, path);
    return getDownloadURL(storageRef);
}