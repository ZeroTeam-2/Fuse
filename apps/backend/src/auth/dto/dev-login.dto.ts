import { IsNotEmpty, IsString } from "class-validator";

/**
 * Тело локального входа без OAuth. Эндпоинт исключён из Swagger, поэтому
 * Api*-декораторов здесь нет — только валидация.
 *
 * Поле `email` проверяется как непустая строка, а не как `@IsEmail`: иначе
 * логин неверного формата давал бы 400, а логин верного формата — 401, и ответы
 * перестали бы быть неразличимыми (спека local-dev-login).
 */
export class DevLoginDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
