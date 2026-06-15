// src/api/axios-instance.ts

import axios, { type AxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// The real axios instance: base URL + auth header. This is shared by every
// generated SDK call so configuration lives in exactly one place.
export const axiosInstance = axios.create({
  baseURL: API_URL,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Orval mutator.
 *
 * Orval calls this for every request as `customAxios<T>({ url, method, ... })`.
 * It must accept an AxiosRequestConfig and return a Promise of the response
 * BODY (T) — not the full AxiosResponse. We unwrap `.data` here so every
 * generated hook/function is typed as the actual payload.
 *
 * React Query passes an AbortSignal in the config automatically, so requests
 * are cancelled when a component unmounts — no extra wiring needed.
 */
export const customAxios = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data);
};
