// Inspeção leve de .zip no navegador — lê APENAS o índice (Central Directory), sem descompactar,
// para listar os nomes dos arquivos e decidir se o pacote contém CÓDIGO-FONTE.

// Extensões consideradas código-fonte (TOTVS/ADVPL/TLPP, Datalog/Progress e linguagens gerais).
const SOURCE_EXT = new Set([
  // TOTVS Protheus / ADVPL / TLPP
  'prw', 'prx', 'tlpp', 'apl', 'apw', 'aph', 'apc', 'apf', 'apo', 'ahu', 'ch', 'prg', 'aef', 'tres',
  // Progress / Datasul
  'p', 'w', 'i', 'cls',
  // Linguagens gerais
  'java', 'cs', 'py', 'js', 'jsx', 'ts', 'tsx', 'php', 'sql', 'xml', 'json', 'html', 'htm',
  'css', 'scss', 'less', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'vb', 'vbs', 'bas', 'frm',
  'cbl', 'cob', 'cpy', 'rpg', 'abap', 'go', 'rb', 'rs', 'kt', 'swift', 'pas', 'dpr', 'lua',
  'sh', 'bash', 'ps1', 'pl', 'pm', 'r', 'scala', 'groovy', 'gvy', 'dart', 'vue', 'svelte',
  'asp', 'aspx', 'jsp', 'ejs', 'twig', 'yml', 'yaml',
])

// Lê os NOMES dos arquivos de um zip pelo Central Directory. Retorna null se não conseguir parsear
// (zip inválido/zip64/erro) — o chamador decide o fallback.
async function readZipEntryNames(file: File): Promise<string[] | null> {
  try {
    const size = file.size
    // EOCD fica no fim do arquivo (22 bytes fixos + até 65535 de comentário).
    const tailLen = Math.min(size, 65557)
    const tail = new DataView(await file.slice(size - tailLen, size).arrayBuffer())
    let eocd = -1
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) return null
    const cdSize = tail.getUint32(eocd + 12, true)
    const cdOffset = tail.getUint32(eocd + 16, true)
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) return null // zip64 — não tratado
    const cdBuf = await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer()
    const cd = new DataView(cdBuf)
    const dec = new TextDecoder()
    const names: string[] = []
    let p = 0
    while (p + 46 <= cd.byteLength) {
      if (cd.getUint32(p, true) !== 0x02014b50) break // fim/registro inválido
      const fnLen = cd.getUint16(p + 28, true)
      const exLen = cd.getUint16(p + 30, true)
      const cmLen = cd.getUint16(p + 32, true)
      names.push(dec.decode(new Uint8Array(cdBuf, p + 46, fnLen)))
      p += 46 + fnLen + exLen + cmLen
      if (names.length > 50000) break
    }
    return names
  } catch {
    return null
  }
}

// 'yes' = contém código-fonte; 'no' = zip lido mas SEM código-fonte; 'unknown' = não deu p/ verificar.
export async function zipLooksLikeSource(file: File): Promise<'yes' | 'no' | 'unknown'> {
  const names = await readZipEntryNames(file)
  if (!names) return 'unknown'
  const files = names.filter(n => !n.endsWith('/'))
  if (files.length === 0) return 'unknown'
  const has = files.some(n => {
    const base = (n.split('/').pop() || n).toLowerCase()
    const dot = base.lastIndexOf('.')
    if (dot < 0) return false
    return SOURCE_EXT.has(base.slice(dot + 1))
  })
  return has ? 'yes' : 'no'
}
