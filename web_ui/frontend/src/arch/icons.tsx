import {
  siReact, siNextdotjs, siVuedotjs, siAngular, siNodedotjs,
  siPython, siFastapi, siDjango, siFlask, siSpring, siSpringboot,
  siPostgresql, siMysql, siMongodb, siRedis, siApachekafka,
  siRabbitmq, siElasticsearch, siDocker, siKubernetes,
  siNginx, siGrafana, siPrometheus, siFirebase, siSupabase,
  siStripe, siGithub, siTypescript,
} from 'simple-icons'
import { Monitor, Server, Database, Cpu, Globe, HardDrive, Smartphone, Box } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface SimpleIcon { svg: string; hex: string; title: string }

const SIMPLE_ICONS: Record<string, SimpleIcon> = {
  react: siReact,
  nextjs: siNextdotjs,
  vuejs: siVuedotjs,
  angular: siAngular,
  nodejs: siNodedotjs,
  python: siPython,
  fastapi: siFastapi,
  django: siDjango,
  flask: siFlask,
  spring: siSpring,
  springboot: siSpringboot,
  postgresql: siPostgresql,
  mysql: siMysql,
  mongodb: siMongodb,
  redis: siRedis,
  kafka: siApachekafka,
  rabbitmq: siRabbitmq,
  elasticsearch: siElasticsearch,
  docker: siDocker,
  kubernetes: siKubernetes,
  nginx: siNginx,
  grafana: siGrafana,
  prometheus: siPrometheus,
  firebase: siFirebase,
  supabase: siSupabase,
  stripe: siStripe,
  github: siGithub,
  typescript: siTypescript,
}

const SYSTEM_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  client: { Icon: Monitor, color: '#58a6ff' },
  browser: { Icon: Globe, color: '#58a6ff' },
  server: { Icon: Server, color: '#8b949e' },
  service: { Icon: Cpu, color: '#f5a623' },
  database: { Icon: Database, color: '#4a90d9' },
  queue: { Icon: Box, color: '#bc8cff' },
  gateway: { Icon: Globe, color: '#e91e8c' },
  'load-balancer': { Icon: Server, color: '#00d4aa' },
  cache: { Icon: Cpu, color: '#00d4aa' },
  storage: { Icon: HardDrive, color: '#4a90d9' },
  mobile: { Icon: Smartphone, color: '#58a6ff' },
}

export function getSimpleIcon(name: string): SimpleIcon | null {
  return SIMPLE_ICONS[name.toLowerCase()] ?? null
}

export function getSystemIcon(name: string) {
  return SYSTEM_ICONS[name.toLowerCase()] ?? SYSTEM_ICONS['service']
}

interface TechIconProps {
  name: string
  size?: number
  color?: string
}

export function TechIcon({ name, size = 24, color }: TechIconProps) {
  const si = getSimpleIcon(name)
  if (si) {
    const fill = color || '#' + si.hex
    const svgContent = si.svg
      .replace('<svg ', `<svg width="${size}" height="${size}" fill="${fill}" `)
    return <div style={{ width: size, height: size, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svgContent }} />
  }
  const sys = getSystemIcon(name)
  const iconColor = color || sys.color
  return <sys.Icon size={size} color={iconColor} strokeWidth={1.5} />
}

export function getIconColor(name: string, override?: string): string {
  if (override) return override
  const si = getSimpleIcon(name)
  if (si) return '#' + si.hex
  return getSystemIcon(name).color
}
