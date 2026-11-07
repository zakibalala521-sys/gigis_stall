import { useCallback, useEffect, useState } from 'react'
import { ImagePlus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { apiFetch } from './api'
import './MenuManager.css'

const apiUrl = import.meta.env.VITE_API_URL || ''
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const peso = (value) => `₱${Number(value).toFixed(2)}`
const imageUrl = (image) => {
  if (!image) return '/menu/placeholder.svg'
  if (/^https?:\/\//i.test(image) || image.startsWith('/')) return image
  const filename = image.split(/[\\/]/).pop()
  return filename ? `/menu/${encodeURIComponent(filename)}` : '/menu/placeholder.svg'
}

const emptyForm = () => ({
  product_id: 0,
  name: '',
  category_id: '',
  description: '',
  unit: '1 serving',
  price: '',
  is_available: true,
})

async function readImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 2 MB.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ data: reader.result, type: file.type })
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

async function requestMenu(options = {}) {
  const response = await apiFetch(`${apiUrl}/api/admin/menu`, options)
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.message || 'Could not manage the menu.')
  return data
}

function MenuManager({ onMenuChanged }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [selectedImage, setSelectedImage] = useState(null)
  const [preview, setPreview] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const loadMenu = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestMenu()
      setProducts(data.products)
      setCategories(data.categories)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    requestMenu()
      .then((data) => {
        if (active) {
          setProducts(data.products)
          setCategories(data.categories)
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const visibleProducts = products.filter((product) => (
    `${product.name} ${product.categories?.name || ''}`.toLowerCase().includes(search.toLowerCase())
  ))

  const openForm = (product = null) => {
    setError('')
    setNotice('')
    setSelectedImage(null)
    setForm(product ? {
      product_id: product.product_id,
      name: product.name,
      category_id: String(product.category_id),
      description: product.description || '',
      unit: product.unit,
      price: String(product.price),
      is_available: Boolean(product.is_available),
      is_archived: Boolean(product.is_archived),
      image: product.image,
      remove_image: false,
    } : emptyForm())
    setPreview(product ? imageUrl(product.image) : '')
    setModalOpen(true)
  }

  const chooseImage = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const image = await readImage(file)
      setSelectedImage(image)
      setForm((current) => ({ ...current, remove_image: false }))
      setPreview(image.data)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
      event.target.value = ''
    }
  }

  const saveProduct = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const body = {
        product_id: form.product_id,
        name: form.name,
        category_id: form.category_id,
        description: form.description,
        unit: form.unit,
        price: form.price,
        is_available: form.is_available,
        ...(form.is_archived ? { is_archived: false } : {}),
        ...(selectedImage ? { image: selectedImage } : {}),
        ...(form.remove_image ? { remove_image: true } : {}),
      }
      const data = await requestMenu({
        method: form.product_id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setModalOpen(false)
      setNotice(data.message)
      onMenuChanged()
      await loadMenu()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const changeAvailability = async (product) => {
    setError('')
    setNotice('')
    try {
      const data = await requestMenu({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.product_id, is_available: !product.is_available }),
      })
      setNotice(data.message)
      onMenuChanged()
      await loadMenu()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const removeProduct = async (product) => {
    if (!window.confirm(`Remove "${product.name}" from the menu?`)) return
    setError('')
    setNotice('')
    try {
      const data = await requestMenu({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.product_id }),
      })
      setNotice(data.message)
      onMenuChanged()
      await loadMenu()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="menu-manager">
      <div className="admin-heading">
        <div><p className="eyebrow">Menu manager</p><h1>Your menu,<br /><i>your way.</i></h1></div>
        <button className="button button-dark" type="button" onClick={() => openForm()}><Plus size={17} /> Add dish</button>
      </div>

      {error && <p className="manager-message manager-error" role="alert">{error}</p>}
      {notice && <p className="manager-message manager-success" role="status">{notice}</p>}

      <div className="manager-toolbar">
        <p>{products.length} menu {products.length === 1 ? 'item' : 'items'}</p>
        <label className="manager-search">Search dishes<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu..." /></label>
        <button className="manager-refresh" type="button" onClick={loadMenu} disabled={loading} aria-label="Refresh menu"><RefreshCw size={17} /></button>
      </div>

      {loading && products.length === 0 ? <p className="empty-state">Loading menu items...</p> : visibleProducts.length === 0 ? (
        <p className="empty-state">{products.length ? 'No dishes match your search.' : 'No dishes yet. Add your first menu item.'}</p>
      ) : (
        <div className="manager-grid">
          {visibleProducts.map((product) => (
            <article className={`manager-card${product.is_archived ? ' archived' : ''}`} key={product.product_id}>
              <div className="manager-image"><img src={imageUrl(product.image)} alt={product.name} /><span className={product.is_archived ? 'badge-archived' : product.is_available ? 'badge-available' : 'badge-sold-out'}>{product.is_archived ? 'Archived' : product.is_available ? 'Available' : 'Sold out'}</span></div>
              <div className="manager-card-body">
                <div className="manager-card-heading"><div><p>{product.categories?.name || 'Uncategorized'} · {product.unit}</p><h2>{product.name}</h2></div><strong>{peso(product.price)}</strong></div>
                <p className="manager-description">{product.description || 'No description added.'}</p>
                <div className="manager-actions">
                  {product.is_archived ? (
                    <button className="manager-action" type="button" onClick={() => openForm(product)}><RefreshCw size={15} /> Restore</button>
                  ) : (
                    <>
                      <button className="manager-action" type="button" onClick={() => changeAvailability(product)}>{product.is_available ? 'Mark sold out' : 'Mark available'}</button>
                      <button className="manager-action" type="button" onClick={() => openForm(product)}><Pencil size={15} /> Edit</button>
                    </>
                  )}
                  <button className="manager-action manager-delete" type="button" onClick={() => removeProduct(product)}><Trash2 size={15} /> Remove</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="manager-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}>
          <section className="manager-modal" role="dialog" aria-modal="true" aria-labelledby="menu-form-title">
            <div className="manager-modal-heading"><div><p className="eyebrow">Menu manager</p><h2 id="menu-form-title">{form.product_id ? (form.is_archived ? 'Restore dish' : 'Edit dish') : 'Add a dish'}</h2></div><button type="button" className="manager-modal-close" onClick={() => setModalOpen(false)} disabled={saving} aria-label="Close">×</button></div>
            <form className="manager-form" onSubmit={saveProduct}>
              <label>Dish name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="100" required /></label>
              <div className="manager-form-row">
                <label>Category<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="" disabled>Select category</option>{categories.map((category) => <option value={category.category_id} key={category.category_id}>{category.name}</option>)}</select></label>
                <label>Price (₱)<input type="number" min="0" max="999999.99" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
              </div>
              <div className="manager-form-row">
                <label>Serving unit<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} maxLength="30" placeholder="1 serving" required /></label>
                <label>Availability<select value={form.is_available ? 'available' : 'sold-out'} onChange={(event) => setForm({ ...form, is_available: event.target.value === 'available' })}><option value="available">Available</option><option value="sold-out">Sold out</option></select></label>
              </div>
              <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength="255" rows="3" /></label>
              <label className="manager-image-picker"><span><ImagePlus size={18} /> Menu image <small>JPEG, PNG or WebP · max 2 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /></label>
              {preview && <img className="manager-preview" src={preview} alt="Selected menu item preview" />}
              {preview && form.product_id > 0 && !form.remove_image && <button className="manager-remove-image" type="button" onClick={() => { setPreview(''); setSelectedImage(null); setForm((current) => ({ ...current, remove_image: true })) }}>Remove current image</button>}
              {error && <p className="manager-message manager-error" role="alert">{error}</p>}
              <div className="manager-form-actions"><button type="button" className="manager-cancel" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Saving...' : form.product_id ? (form.is_archived ? 'Restore dish' : 'Save changes') : 'Add dish'}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default MenuManager
