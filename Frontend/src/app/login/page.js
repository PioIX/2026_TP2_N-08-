"use client"

import Input from "@/components/Input"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Button from "@/components/Button"

export default function LoginPage() {

  const router = useRouter()
  const [mail, setMail] = useState("")
  const [password, setPassword] = useState("")

  const [EsRegistro, setEsRegistro] = useState(false)
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [foto, setFoto] = useState(null)

  const onChangefoto = (event) => {
    const archivo = event.target.files[0];
    setFoto(archivo);
  }

  const onChangeMail = (event) => {
    setMail(event.target.value)
  }

  const onChangePassword = (event) => {
    setPassword(event.target.value)
  }

  const onChangeNombre = (event) => {
    setNombre(event.target.value)
  }

  const onChangeApellido = (event) => {
    setApellido(event.target.value)
  }

  const cambiarModo = () => {
    setEsRegistro(!EsRegistro)
  }

  const handleLogin = () => {
    fetch("http://localhost:4000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: mail, password: password }),
    }).then((response) => {
      return response.json().then((data) => {
        if (response.ok) {
          router.push(`/contactos?id=${data.usuario.id_usuario}&nombre=${data.usuario.nombre}`);
        } else {
          alert("Error: " + data.message);
        }
      });
    });
  };

  const handleRegister = () => {
    fetch("http://localhost:4000/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, apellido, email: mail, password }),
    }).then((response) => {
      return response.json().then((data) => {
        if (response.ok) {
          router.push(`/contactos?id=${data.id_usuario}&nombre=${nombre}`);
        } else {
          alert("Error: " + data.message);
        }
      });
    });
  };

  return (
    <>
      {EsRegistro ? (
        <div>
          <p>Nombre</p>
          <Input onChange={onChangeNombre} placeholder={"Nombre"} value={nombre} />
          <p>Apellido</p>
          <Input onChange={onChangeApellido} placeholder={"Apellido"} value={apellido} />
          <p>Email</p>
          <Input onChange={onChangeMail} placeholder={"email"} value={mail} />
          <p>Contraseña</p>
          <Input onChange={onChangePassword} placeholder={"contraseña"} value={password} type={"password"} />
          <p>Foto de Perfil</p>
          <input onChange={onChangefoto} type={"file"} accept="image/*" />
          <Button onClick={handleRegister}> Registrarse </Button>
        </div>
      ) : (
        <div>
          <p>Email</p>
          <Input onChange={onChangeMail} placeholder={"email"} value={mail} />
          <p>Contraseña</p>
          <Input onChange={onChangePassword} placeholder={"contraseña"} value={password} type={"password"} />
          <Button onClick={handleLogin}>Ingresar</Button>
        </div>
      )}

      <Button onClick={cambiarModo}>
        {EsRegistro ? "Ya tenes cuenta? ingresa" : "Registrate"}
      </Button>
    </>
  )
}