// Common pagination types
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
}
