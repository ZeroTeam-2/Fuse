<template>
  <div class="profile-page">
    <div class="profile-section">
      <div class="section-header">
        <h2 class="section-title">Личные данные</h2>
        <button
          v-if="!editing"
          class="edit-btn"
          @click="startEdit"
        >
          Редактировать
        </button>
      </div>

      <div class="avatar-row">
        <div class="avatar-container">
          <img
            v-if="avatarPreview || authStore.user?.avatarUrl"
            :src="avatarPreview || authStore.user?.avatarUrl"
            alt="avatar"
            class="avatar"
          />
          <div v-else class="avatar-placeholder">
            {{ initials }}
          </div>
        </div>
        <div class="avatar-actions">
          <label class="upload-btn">
            <input
              type="file"
              accept="image/*"
              class="file-input"
              @change="onAvatarChange"
            />
            Загрузить фото
          </label>
          <button
            v-if="authStore.user?.avatarUrl"
            class="remove-btn"
            @click="removeAvatar"
          >
            Удалить
          </button>
        </div>
      </div>

      <div v-if="!editing" class="info-grid">
        <div class="info-item">
          <span class="info-label">ФИО</span>
          <span class="info-value">{{ fullName }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Email</span>
          <span class="info-value">{{ authStore.user?.email }}</span>
        </div>
      </div>

      <form v-else class="edit-form" @submit.prevent="saveProfile">
        <div class="form-row">
          <label class="form-label">
            Имя
            <input v-model="editForm.firstName" type="text" class="form-input" />
          </label>
          <label class="form-label">
            Фамилия
            <input v-model="editForm.lastName" type="text" class="form-input" />
          </label>
        </div>
        <label class="form-label">
          Email
          <input v-model="editForm.email" type="email" class="form-input" />
        </label>
        <div class="form-actions">
          <button type="button" class="cancel-btn" @click="cancelEdit">Отмена</button>
          <button type="submit" class="save-btn">Сохранить изменения</button>
        </div>
      </form>
    </div>

    <div class="profile-section">
      <div class="section-header">
        <h2 class="section-title">Мои API</h2>
        <NuxtLink to="/my/apps" class="link-btn">Все</NuxtLink>
      </div>
      <div v-if="myApps.length === 0" class="empty-state">
        Нет подключённых API
      </div>
      <div v-else class="item-list">
        <div v-for="app in myApps" :key="app.id" class="item-card">
          <div class="item-info">
            <span class="item-name">{{ app.name }}</span>
            <span class="item-meta">{{ app.endpoints?.length ?? 0 }} endpoints</span>
          </div>
          <span :class="['status-badge', app.published ? 'published' : 'unpublished']">
            {{ app.published ? "Опубликован" : "Скрыт" }}
          </span>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <div class="section-header">
        <h2 class="section-title">Мои сценарии</h2>
        <NuxtLink to="/my/scenarios" class="link-btn">Все</NuxtLink>
      </div>
      <div v-if="myScenarios.length === 0" class="empty-state">
        Нет созданных сценариев
      </div>
      <div v-else class="item-list">
        <div v-for="scenario in myScenarios" :key="scenario.id" class="item-card">
          <div class="item-info">
            <span class="item-name">{{ scenario.title }}</span>
            <span class="item-meta">{{ scenario.steps?.length ?? 0 }} шагов</span>
          </div>
          <span :class="['status-badge', scenario.published ? 'published' : 'unpublished']">
            {{ scenario.published ? "Опубликован" : "Черновик" }}
          </span>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <button class="logout-btn" @click="logout">Выйти</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore();

const editing = ref(false);
const editForm = reactive({
  firstName: "",
  lastName: "",
  email: "",
});
const avatarPreview = ref<string | null>(null);
const avatarFile = ref<File | null>(null);

const myApps = ref<any[]>([]);
const myScenarios = ref<any[]>([]);

const initials = computed(() => {
  const u = authStore.user;
  if (!u) return "?";
  return ((u.firstName?.[0] ?? "") + (u.lastName?.[0] ?? "")).toUpperCase();
});

const fullName = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  return [u.firstName, u.lastName].filter(Boolean).join(" ");
});

function startEdit() {
  const u = authStore.user;
  if (!u) return;
  editForm.firstName = u.firstName;
  editForm.lastName = u.lastName;
  editForm.email = u.email;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
}

async function saveProfile() {
  const { $api } = useNuxtApp() as any;
  try {
    await $api.PATCH("/api/users/me", { body: editForm });
    await authStore.fetchUser();
    editing.value = false;
  } catch {
    // handle error
  }
}

function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  avatarFile.value = file;
  avatarPreview.value = URL.createObjectURL(file);
}

async function removeAvatar() {
  const { $api } = useNuxtApp() as any;
  try {
    await $api.DELETE("/api/users/me/avatar", {});
    avatarPreview.value = null;
    avatarFile.value = null;
    await authStore.fetchUser();
  } catch {
    // handle error
  }
}

async function logout() {
  await fetch(`${useApiBase()}/api/auth/logout`, { credentials: "include" });
  authStore.clearUser();
  await navigateTo("/login");
}

onMounted(() => {
  if (!authStore.isAuthenticated) {
    navigateTo("/login");
  }
});
</script>

<style scoped>
.profile-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.profile-section {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #18181b;
  margin: 0;
}

.edit-btn, .link-btn {
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: none;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #6366f1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #18181b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.file-input {
  display: none;
}

.remove-btn {
  font-size: 14px;
  color: #e11d48;
  background: none;
  border: none;
  cursor: pointer;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #71717a;
  font-weight: 500;
}

.info-value {
  font-size: 15px;
  color: #18181b;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #71717a;
  font-weight: 500;
  flex: 1;
}

.form-input {
  padding: 10px 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  font-size: 14px;
  color: #18181b;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
  color: #52525b;
  font-size: 14px;
  cursor: pointer;
}

.save-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.empty-state {
  font-size: 14px;
  color: #a1a1aa;
  padding: 16px 0;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f4f4f5;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
}

.item-meta {
  font-size: 12px;
  color: #a1a1aa;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 100px;
}

.status-badge.published {
  background: #dcfce7;
  color: #16a34a;
}

.status-badge.unpublished {
  background: #f4f4f5;
  color: #71717a;
}

.logout-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #fecaca;
  background: #fff;
  color: #e11d48;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.logout-btn:hover {
  background: #fef2f2;
}
</style>
