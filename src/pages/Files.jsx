import { useState } from 'react'
import { useStore } from '../store.jsx'
import { FileList, FilePicker, Empty } from '../ui.jsx'

export default function FilesPage({ clientId, embedded }) {
  const { view, user, actions } = useStore()
  const staff = user.role !== 'client'
  const cid = clientId || (staff ? null : user.clientId)
  const [filter, setFilter] = useState('all')
  let files = view.files.filter((f) => !cid || f.clientId === cid)
  if (filter !== 'all') files = files.filter((f) => (filter === 'img' ? f.mime?.startsWith('image') : filter === 'vid' ? f.mime?.startsWith('video') : !f.mime?.startsWith('image') && !f.mime?.startsWith('video')))
  const groups = {}
  for (const f of files) {
    const k = f.taskId ? 'De tareas' : 'Generales'
    ;(groups[k] ||= []).push(f)
  }
  const upload = (fs) => {
    const target = cid || view.clients[0]?.id
    const project = view.projects.find((p) => p.clientId === target)
    fs.forEach((x) => actions.addFile({ ...x, clientId: target, projectId: project?.id, shared: true }))
  }
  return (
    <div>
      {!embedded && <div className="page-h"><div><h1>Archivos</h1><p className="muted">{staff ? 'Archivos de todos los clientes.' : 'Archivos compartidos entre vos y Bull Partners.'}</p></div></div>}
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="img">Imágenes</option><option value="vid">Videos</option><option value="doc">Documentos</option></select>
        <span className="grow" />
        {(cid || !staff) && <FilePicker label="Subir archivos" onFiles={upload} />}
      </div>
      {files.length === 0 ? <div className="card"><Empty icon="📁" title="Sin archivos" text={staff && !cid ? 'Entrá a un cliente para subir archivos.' : 'Subí documentos, fotos o videos.'} /></div>
        : Object.entries(groups).map(([k, fs]) => <div key={k} className="card mb"><h3>{k}</h3><FileList files={fs} canManage={staff} /></div>)}
    </div>
  )
}
