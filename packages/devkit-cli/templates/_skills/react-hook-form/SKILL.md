---
name: react-hook-form
description: "React Hook Form + Zod 심화 폼 패턴. 멀티스텝 폼, 동적 필드, 파일 업로드, Server Action 연동, 조건부 검증.\nAPPLIES: 폼을 만들거나 고칠 때, `useForm`·`zodResolver`·필드 검증·제출 처리를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"폼 만들어줘\", \"입력 검증\", \"회원가입 폼\", \"useForm\", \"form validation\", \"폼 제출\", \"입력 폼\", \"파일 업로드 폼\", \"멀티스텝\", React/Next.js에서 폼 구현 시.\nSKIP: NestJS DTO 서버 검증은 nestjs-validation. 서버 제출 로직만이면 server-actions."
---

# React Hook Form + Zod 심화 가이드

## 설치

```bash
pnpm add react-hook-form @hookform/resolvers zod
```

## 기본 패턴

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "2자 이상 입력하세요"),
  email: z.email("올바른 이메일을 입력하세요"),
  age: z.coerce.number().min(1).max(150),
});

type FormData = z.infer<typeof schema>;

export function UserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", age: 0 },
  });

  const onSubmit = async (data: FormData) => {
    await createUser(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} />
      {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}

      <input {...register("email")} />
      {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}

      <input {...register("age")} type="number" />
      {errors.age && <p className="text-destructive text-sm">{errors.age.message}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
```

## 동적 필드 (useFieldArray)

```tsx
"use client";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  teamName: z.string().min(1),
  members: z
    .array(
      z.object({
        name: z.string().min(1, "이름을 입력하세요"),
        role: z.enum(["developer", "designer", "pm"]),
      })
    )
    .min(1, "최소 1명의 멤버가 필요합니다"),
});

type FormData = z.infer<typeof schema>;

export function TeamForm() {
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { teamName: "", members: [{ name: "", role: "developer" }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "members" });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("teamName")} placeholder="팀 이름" />

      {fields.map((field, index) => (
        <div key={field.id} className="flex gap-2">
          <input {...register(`members.${index}.name`)} placeholder="이름" />
          <select {...register(`members.${index}.role`)}>
            <option value="developer">개발자</option>
            <option value="designer">디자이너</option>
            <option value="pm">PM</option>
          </select>
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(index)}>삭제</button>
          )}
          {errors.members?.[index]?.name && (
            <p className="text-destructive text-sm">
              {errors.members[index].name.message}
            </p>
          )}
        </div>
      ))}

      <button type="button" onClick={() => append({ name: "", role: "developer" })}>
        멤버 추가
      </button>
      {errors.members?.root && (
        <p className="text-destructive text-sm">{errors.members.root.message}</p>
      )}

      <button type="submit">저장</button>
    </form>
  );
}
```

## 멀티스텝 폼

```tsx
"use client";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

// 단계별 스키마
const step1Schema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

const step2Schema = z.object({
  address: z.string().min(5),
  phone: z.string().regex(/^01[0-9]-\d{4}-\d{4}$/, "올바른 전화번호 형식"),
});

const step3Schema = z.object({
  plan: z.enum(["free", "pro", "enterprise"]),
  agree: z.literal(true, { errorMap: () => ({ message: "약관에 동의해주세요" }) }),
});

// 전체 스키마
const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema);
type FormData = z.infer<typeof fullSchema>;

const stepSchemas = [step1Schema, step2Schema, step3Schema] as const;

export function MultiStepForm() {
  const [step, setStep] = useState(0);

  const methods = useForm<FormData>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      name: "", email: "", address: "", phone: "",
      plan: "free", agree: false as unknown as true,
    },
    mode: "onTouched",
  });

  const next = async () => {
    const fields = Object.keys(stepSchemas[step].shape) as (keyof FormData)[];
    const valid = await methods.trigger(fields);
    if (valid) setStep((s) => s + 1);
  };

  const prev = () => setStep((s) => s - 1);

  const onSubmit = async (data: FormData) => {
    await submitRegistration(data);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        {/* 진행률 표시 */}
        <div className="flex gap-2 mb-6">
          {stepSchemas.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {step === 0 && <Step1 />}
        {step === 1 && <Step2 />}
        {step === 2 && <Step3 />}

        <div className="flex justify-between mt-4">
          {step > 0 && <button type="button" onClick={prev}>이전</button>}
          {step < 2 ? (
            <button type="button" onClick={next}>다음</button>
          ) : (
            <button type="submit" disabled={methods.formState.isSubmitting}>
              완료
            </button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

// 하위 컴포넌트에서 useFormContext 사용
function Step1() {
  const { register, formState: { errors } } = useFormContext<FormData>();
  return (
    <div className="space-y-3">
      <input {...register("name")} placeholder="이름" />
      {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      <input {...register("email")} placeholder="이메일" />
      {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
    </div>
  );
}
```

## 조건부 검증 (Discriminated Union)

```typescript
const schema = z.discriminatedUnion("contactMethod", [
  z.object({
    contactMethod: z.literal("email"),
    email: z.email(),
  }),
  z.object({
    contactMethod: z.literal("phone"),
    phone: z.string().min(10),
  }),
  z.object({
    contactMethod: z.literal("none"),
  }),
]);
```

### refine을 사용한 교차 필드 검증

```typescript
const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });
```

## 파일 업로드 + 미리보기

```tsx
"use client";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const schema = z.object({
  title: z.string().min(1),
  image: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_FILE_SIZE, "파일 크기는 5MB 이하여야 합니다")
    .refine((f) => ACCEPTED_TYPES.includes(f.type), "JPG, PNG, WebP만 허용됩니다"),
});

type FormData = z.infer<typeof schema>;

export function ImageUploadForm() {
  const [preview, setPreview] = useState<string | null>(null);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValue("image", file, { shouldValidate: true });
    setPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data: FormData) => {
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("image", data.image);
    await uploadImage(formData);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("title")} placeholder="제목" />
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {preview && <img src={preview} alt="미리보기" className="w-32 h-32 object-cover" />}
      {errors.image && <p className="text-destructive text-sm">{errors.image.message}</p>}
      <button type="submit">업로드</button>
    </form>
  );
}
```

## Server Action 연동

### useActionState 패턴

```tsx
"use client";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createPost, type ActionState } from "@/app/actions/posts";

const schema = z.object({
  title: z.string().min(1),
  content: z.string().min(10),
});

type FormData = z.infer<typeof schema>;

export function PostForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [state, action, isPending] = useActionState(
    async (_prev: ActionState, formData: FormData) => {
      return await createPost(formData);
    },
    { error: null, success: false }
  );

  return (
    <form onSubmit={handleSubmit((data) => action(data))}>
      <input {...register("title")} />
      {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}

      <textarea {...register("content")} />
      {errors.content && <p className="text-destructive text-sm">{errors.content.message}</p>}

      {/* 서버 에러 표시 */}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}
```

## shadcn/ui Form 연동

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  username: z.string().min(3).max(20),
  bio: z.string().max(160).optional(),
});

export function ProfileForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", bio: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>사용자명</FormLabel>
              <FormControl>
                <Input placeholder="username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>저장</Button>
      </form>
    </Form>
  );
}
```

## 성능 최적화

```tsx
// watch vs getValues
const watchedName = watch("name"); // 리렌더링 발생 (구독)
const name = getValues("name");    // 리렌더링 없음 (스냅샷)

// 특정 필드만 watch
const [name, email] = watch(["name", "email"]);

// 리렌더링 없이 폼 값 관찰
useEffect(() => {
  const subscription = watch((value, { name, type }) => {
    console.log(name, type, value);
  });
  return () => subscription.unsubscribe();
}, [watch]);
```

## Zod 스키마 재사용 패턴

```typescript
// schemas/user.ts
export const userBaseSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

export const createUserSchema = userBaseSchema.extend({
  password: z.string().min(8),
});

export const updateUserSchema = userBaseSchema.partial(); // 모든 필드 optional

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

## 자주 하는 실수

1. **`mode: "onChange"` 남용** - 매 키입력마다 검증 실행. `"onTouched"` 또는 `"onBlur"` 사용
2. **`register`와 `Controller` 혼용** - 네이티브 input은 register, 커스텀 컴포넌트는 Controller
3. **`defaultValues` 누락** - 제어 컴포넌트에서 undefined 경고 발생
4. **파일 input에 `register` 직접 사용** - `setValue`로 수동 설정 필요
5. **`handleSubmit` 없이 form submit** - Zod 검증이 실행되지 않음
6. **스키마와 타입 따로 정의** - `z.infer<typeof schema>`로 타입 자동 추론
