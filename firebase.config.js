// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";

import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyB7hKmSCXAMfMchx34X9aYmrPHCciVO2UE",
    authDomain: "f3-engine.firebaseapp.com",
    projectId: "f3-engine",
    storageBucket: "f3-engine.appspot.com",
    messagingSenderId: "244535401486",
    appId: "1:244535401486:web:1c27d76cc4095c8f01705f",
    measurementId: "G-BY85L7N7LB"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
// Initialize firestore
export const db = getFirestore(app)