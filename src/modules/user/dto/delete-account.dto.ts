import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  // Re-entering the password stops a stolen or left-open session from closing the account.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
