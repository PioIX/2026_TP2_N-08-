"use client"

export default function Input({ placeholder, onChange, value, type }) {
    return (
        <input placeholder={placeholder} onChange={onChange} value={value} type={type} />
    )

}