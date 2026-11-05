export interface JwtPayload {
  userId: string;
  email: string;
  /**
   * Идентификатор сессии в access-токене. Совпадает с `jti` refresh-токена той
   * же пары: по нему `JwtStrategy` проверяет, что сессия не отозвана.
   * Необязательное поле — токены, выпущенные до появления сессий, его не несут
   * и при проверке отбиваются.
   */
  sId?: string;
  /** Идентификатор самой сессии в refresh-токене. */
  jti?: string;
  /** Версия токенов пользователя: растёт на «выйти везде». */
  ver?: number;
}

/** Данные, которые `JwtStrategy` кладёт в `req.user` после проверки токена. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  /** Сессия текущего запроса — её отзывает выход. */
  sId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Время жизни access-токена в мс, синхронизировано с claim `exp` из JWT. */
  accessTokenMaxAge: number;
  /** Время жизни refresh-токена в мс, синхронизировано с claim `exp` из JWT. */
  refreshTokenMaxAge: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
