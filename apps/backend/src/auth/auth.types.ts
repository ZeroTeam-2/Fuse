export interface JwtPayload {
  userId: string;
  email: string;
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
  user: JwtPayload;
}
