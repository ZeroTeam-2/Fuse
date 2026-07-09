<template>
  <div class="file-dropzone">
    <div
      class="drop-area"
      :class="{ dragging, disabled: isUploading }"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      @click="openFilePicker"
    >
      <input
        ref="fileInput"
        type="file"
        class="file-input"
        :accept="accept"
        @change="onFileSelected"
      />
      <div class="drop-content">
        <div class="drop-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <p class="drop-title">
          {{ isUploading ? 'Загрузка...' : 'Перетащите файл или нажмите для выбора' }}
        </p>
        <p class="drop-hint">
          Максимальный размер одного файла: {{ maxSingleMb }} МБ
        </p>
      </div>
    </div>

    <div v-if="progress.visible" class="progress-section">
      <div class="progress-header">
        <span class="progress-file-name">{{ progress.fileName }}</span>
        <span class="progress-percent">{{ progressPercent }}%</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-bar-fill"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
      <div class="progress-details">
        <span>{{ formatBytes(progress.uploadedBytes) }} / {{ formatBytes(progress.totalBytes) }}</span>
      </div>
      <div class="progress-actions">
        <button
          v-if="isChunked && !isCompleted"
          class="btn btn-pause"
          :disabled="!canPause"
          @click="togglePause"
        >
          {{ isPaused ? 'Продолжить' : 'Пауза' }}
        </button>
        <button
          v-if="!isCompleted"
          class="btn btn-cancel"
          @click="cancelUpload"
        >
          Отмена
        </button>
      </div>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="resultUrl && isCompleted" class="success-message">
      Файл успешно загружен
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    accept?: string
  }>(),
  {
    accept: '*/*',
  },
)

const emit = defineEmits<{
  uploaded: [payload: { url: string; objectName: string; fileName: string }]
  error: [message: string]
}>()

const { $api } = useNuxtApp() as unknown as {
  $api: {
    POST: (
      url: string,
      opts: Record<string, unknown>,
    ) => Promise<{ data: { value: unknown }; error: { value: unknown } }>
    GET: (
      url: string,
      opts: Record<string, unknown>,
    ) => Promise<{ data: { value: unknown }; error: { value: unknown } }>
  }
}

const runtimeConfig = useRuntimeConfig()
const maxSingleMb = computed(
  () => (runtimeConfig.public as { fileSingleUploadMaxMb?: number }).fileSingleUploadMaxMb ?? 10,
)

const CHUNK_SIZE = 5 * 1024 * 1024

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const error = ref('')
const resultUrl = ref('')
const isPaused = ref(false)
const isCancelled = ref(false)
const isCompleted = ref(false)
const isUploading = ref(false)
const isChunked = ref(false)
const canPause = computed(() => isChunked.value && !isPaused.value)

const progress = ref({
  visible: false,
  fileName: '',
  uploadedBytes: 0,
  totalBytes: 0,
})

const progressPercent = computed(() => {
  if (progress.value.totalBytes === 0) return 0
  return Math.min(100, Math.round((progress.value.uploadedBytes / progress.value.totalBytes) * 100))
})

function openFilePicker(): void {
  if (!isUploading.value) {
    fileInput.value?.click()
  }
}

function onDragOver(): void {
  dragging.value = true
}

function onDragLeave(): void {
  dragging.value = false
}

function onDrop(e: DragEvent): void {
  dragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

function onFileSelected(e: Event): void {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    handleFile(target.files[0])
  }
}

async function handleFile(file: File): Promise<void> {
  error.value = ''
  resultUrl.value = ''
  isCompleted.value = false
  isCancelled.value = false
  isPaused.value = false

  const maxBytes = maxSingleMb.value * 1024 * 1024

  progress.value = {
    visible: true,
    fileName: file.name,
    uploadedBytes: 0,
    totalBytes: file.size,
  }

  if (file.size <= maxBytes) {
    isChunked.value = false
    isUploading.value = true
    await uploadSingle(file)
  } else {
    isChunked.value = true
    isUploading.value = true
    await uploadChunked(file)
  }

  isUploading.value = false
}

async function uploadSingle(file: File): Promise<void> {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(
      `${runtimeConfig.public.apiBaseUrl}/api/uploads/single`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      },
    )

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message ?? `Upload failed: ${response.status}`)
    }

    const result = (await response.json()) as { url: string; objectName: string }
    progress.value.uploadedBytes = file.size
    resultUrl.value = result.url
    isCompleted.value = true
    emit('uploaded', {
      url: result.url,
      objectName: result.objectName,
      fileName: file.name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    error.value = message
    emit('error', message)
  }
}

async function uploadChunked(file: File): Promise<void> {
  try {
    const { data, error: initError } = await $api.POST(
      '/api/uploads/chunked/init',
      {
        body: {
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
        },
      },
    )

    if (initError.value || !data.value) {
      throw new Error('Failed to initialize chunked upload')
    }

    const initResult = data.value as { uploadId: string }
    const uploadId = initResult.uploadId

    const totalParts = Math.ceil(file.size / CHUNK_SIZE)

    for (let part = 1; part <= totalParts; part++) {
      if (isCancelled.value) return

      while (isPaused.value) {
        await sleep(500)
        if (isCancelled.value) return
      }

      const start = (part - 1) * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)
      const buffer = new Uint8Array(await chunk.arrayBuffer())

      const response = await fetch(
        `${runtimeConfig.public.apiBaseUrl}/api/uploads/chunked/${uploadId}/part/${part}`,
        {
          method: 'POST',
          body: buffer,
          credentials: 'include',
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      )

      if (!response.ok) {
        throw new Error(`Part ${part} upload failed: ${response.status}`)
      }

      progress.value.uploadedBytes = end
    }

    if (isCancelled.value) return

    const completeResponse = await fetch(
      `${runtimeConfig.public.apiBaseUrl}/api/uploads/chunked/${uploadId}/complete`,
      {
        method: 'POST',
        credentials: 'include',
      },
    )

    if (!completeResponse.ok) {
      throw new Error('Failed to complete upload')
    }

    const result = (await completeResponse.json()) as { url: string; objectName: string }
    resultUrl.value = result.url
    isCompleted.value = true
    emit('uploaded', {
      url: result.url,
      objectName: result.objectName,
      fileName: file.name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chunked upload failed'
    error.value = message
    emit('error', message)
  }
}

function togglePause(): void {
  isPaused.value = !isPaused.value
}

async function cancelUpload(): Promise<void> {
  isCancelled.value = true
  isPaused.value = false
  isUploading.value = false
  progress.value.visible = false
  error.value = 'Загрузка отменена'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round(bytes / Math.pow(1024, i))} ${units[i]}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
</script>

<style scoped>
.file-dropzone {
  width: 100%;
}

.drop-area {
  border: 2px dashed #d4d4d8;
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  background: #fafafa;
}

.drop-area:hover {
  border-color: #6366f1;
  background: #f5f3ff;
}

.drop-area.dragging {
  border-color: #6366f1;
  background: #ede9fe;
}

.drop-area.disabled {
  pointer-events: none;
  opacity: 0.6;
}

.file-input {
  display: none;
}

.drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.drop-icon {
  color: #a1a1aa;
}

.drop-title {
  font-size: 15px;
  font-weight: 600;
  color: #18181b;
  margin: 0;
}

.drop-hint {
  font-size: 13px;
  color: #71717a;
  margin: 0;
}

.progress-section {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  background: #f4f4f5;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-file-name {
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70%;
}

.progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: #6366f1;
}

.progress-bar {
  height: 8px;
  background: #e4e4e7;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-details {
  margin-top: 8px;
  font-size: 12px;
  color: #71717a;
}

.progress-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-pause {
  background: #e4e4e7;
  color: #18181b;
}

.btn-pause:hover:not(:disabled) {
  background: #d4d4d8;
}

.btn-pause:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  background: #fee2e2;
  color: #dc2626;
}

.btn-cancel:hover {
  background: #fecaca;
}

.error-message {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #fee2e2;
  color: #dc2626;
  font-size: 13px;
}

.success-message {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #d1fae5;
  color: #059669;
  font-size: 13px;
  font-weight: 600;
}
</style>
