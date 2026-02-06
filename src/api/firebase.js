 
import { initializeApp } from "firebase/app";
import { getDatabase } from 'firebase/database';
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAEEE0DoyOAMYHSuftJOYG6hE1OQrkimPM",
  authDomain: "gudanggalatama.firebaseapp.com",
  databaseURL: "https://gudanggalatama-default-rtdb.firebaseio.com",
  projectId: "gudanggalatama",
  storageBucket: "gudanggalatama.firebasestorage.app",
  messagingSenderId: "197812694747",
  appId: "1:197812694747:web:6edecc32373c4d676726fe",
  measurementId: "G-W5F7PRNZNR"
};


// const firebaseConfig = {
//   apiKey: "AIzaSyBeVbSzrBSRRKu2G5jG_5zOMj1pqyZzZ_c",
//   authDomain: "aplikasimasiko.firebaseapp.com",
//   databaseURL: "https://aplikasimasiko-default-rtdb.firebaseio.com",
//   projectId: "aplikasimasiko",
//   storageBucket: "aplikasimasiko.firebasestorage.app",
//   messagingSenderId: "280089362661",
//   appId: "1:280089362661:web:4494f433a12d12a172540c",
//   measurementId: "G-DBEWZ4B1BB"
// };
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
export { app }; // ✅ tambahkan baris ini
