-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.acciones_municipales (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  categoria text NOT NULL,
  titulo text NOT NULL,
  detalle text,
  observacion text,
  departamento_id bigint,
  creado_por_id bigint,
  creado_por_nombre text,
  creado_por_identificador text,
  reporte_id bigint,
  fotos_url jsonb NOT NULL DEFAULT '[]'::jsonb,
  social_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT acciones_municipales_pkey PRIMARY KEY (id),
  CONSTRAINT acciones_municipales_categoria_fkey FOREIGN KEY (categoria) REFERENCES public.categorias_municipales(slug),
  CONSTRAINT acciones_municipales_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id),
  CONSTRAINT acciones_municipales_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios_municipales(id),
  CONSTRAINT acciones_municipales_reporte_id_fkey FOREIGN KEY (reporte_id) REFERENCES public.reportes(id)
);
CREATE TABLE public.categorias_municipales (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  icono text NOT NULL,
  color text DEFAULT '#d32f2f'::text,
  CONSTRAINT categorias_municipales_pkey PRIMARY KEY (id)
);
CREATE TABLE public.departamentos (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT departamentos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reportes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  categoria text NOT NULL CHECK (categoria = ANY (ARRAY['baches'::text, 'arbol_caido'::text, 'cano_roto'::text, 'basural'::text])),
  detalle text,
  nombre text NOT NULL,
  celular text NOT NULL,
  barrio text,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  departamento_id bigint,
  fotos_url jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  resuelto_por text,
  resuelto_at timestamp with time zone,
  CONSTRAINT reportes_pkey PRIMARY KEY (id),
  CONSTRAINT reportes_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id)
);
CREATE TABLE public.usuarios_municipales (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  email text NOT NULL UNIQUE,
  nombre text NOT NULL,
  departamento text,
  rol text NOT NULL CHECK (rol = ANY (ARRAY['operador'::text, 'operador_jefe'::text, 'intendente'::text, 'superadmin'::text])),
  identificador_publico text DEFAULT ''::text,
  salt text,
  password_hash text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usuarios_municipales_pkey PRIMARY KEY (id)
);