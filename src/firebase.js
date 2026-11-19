import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Config pública del SDK web (no es secreta: la seguridad la dan las reglas de Firestore).
export const firebaseConfig = {
  apiKey: 'AIzaSyDXX7LN9xM9UP4U8G-aBAGu7a9ySF-0KZM',
  authDomain: 'metaflash-bull.firebaseapp.com',
  projectId: 'metaflash-bull',
  storageBucket: 'metaflash-bull.firebasestorage.app',
  messagingSenderId: '271777494167',
  appId: '1:271777494167:web:f28b1c8917c1686a6325d2',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const fs = getFirestore(app)
// App secundaria: crea usuarios nuevos sin cerrar la sesión del admin.
export const auth2 = getAuth(initializeApp(firebaseConfig, 'secondary'))
