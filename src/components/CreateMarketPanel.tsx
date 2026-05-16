import type { FormEvent } from 'react'

type CreateMarketPanelProps = {
  open: boolean
  question: string
  imagePreview?: string
  onQuestionChange: (question: string) => void
  onImageChange: (file: File | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function CreateMarketPanel({
  open,
  question,
  imagePreview,
  onQuestionChange,
  onImageChange,
  onSubmit,
  onClose,
}: CreateMarketPanelProps) {
  if (!open) return null

  return (
    <section className="create-panel" aria-label="Create custom market">
      <div>
        <span>Custom market</span>
        <h2>Create a market for the agent to price</h2>
      </div>
      <form onSubmit={onSubmit}>
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="Will an agent complete a paid x402 market report on Arc before the Agora deadline?"
          rows={3}
        />
        <label className="image-upload">
          <span>Market image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => onImageChange(event.target.files?.[0] ?? null)}
          />
          <strong>{imagePreview ? 'Image attached' : 'Upload optional'}</strong>
        </label>
        {imagePreview ? (
          <div className="upload-preview">
            <img src={imagePreview} alt="" />
          </div>
        ) : null}
        <div className="create-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Create and analyze</button>
        </div>
      </form>
    </section>
  )
}
