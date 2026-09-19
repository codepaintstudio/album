'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_KEY = 'p';

/**
 * 服务端参数（?sort/?fileset/?q/?p…）的唯一写入口：写入会触发一次 RSC 请求。
 * 只改客户端参数时不要用这里，用 useShallowParam。
 */
export function useQueryParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      // 改写任何筛选都可能让"旧筛选的第 7 页"变成空结果，所以顺手清掉页码
      if (key !== PAGE_KEY) {
        next.delete(PAGE_KEY);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );
}

/**
 * 把输入框的值防抖写入 URL。initialValue 传服务端渲染时已知的 ?q= 值，
 * 于是深链（?q=…&p=2）首帧不会被回写覆盖——那会连带删掉 ?p=。
 */
export function useDebouncedParam(key: string, value: string, delay = 300) {
  const setParam = useQueryParamWriter();
  const lastWritten = useRef(value);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastWritten.current) return;

    const handle = setTimeout(() => {
      lastWritten.current = trimmed;
      setParam(key, trimmed || null);
    }, delay);

    return () => clearTimeout(handle);
  }, [value, key, delay, setParam]);
}

/**
 * 只改呈现、不改数据的参数（?view/?group/?photo）走浅层 URL：
 * history.replaceState 不发请求，服务端也不需要知道它。
 *
 * 关键约束：手动 replaceState 之后 useSearchParams() 与 RSC 的 searchParams
 * 都不会更新，所以这里只在挂载时读一次 URL，之后以本地 state 为准。
 */
function readRawParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function writeRawParam(key: string, value: string | null, push: boolean) {
  const params = new URLSearchParams(window.location.search);
  if (value === null) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (push) {
    window.history.pushState(null, '', url);
  } else {
    window.history.replaceState(null, '', url);
  }
}

export function useShallowParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readRawParam(key);
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  });
  const current = useRef(value);
  current.current = value;

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(current.current) : next;
      current.current = resolved;
      setValue(resolved);
      writeRawParam(key, resolved === fallback ? null : resolved, false);
    },
    [key, fallback]
  );

  return [value, update];
}

/**
 * 灯箱用：打开走 pushState，于是浏览器返回键先关灯箱再离开页面；
 * 关闭走 replaceState。popstate 时重新读取 URL，返回键才会真的落到对应状态上。
 *
 * 与上面的规则唯一的例外：?photo= 也会被服务端读一次，用于把深链指向的照片
 * 补进当前页窗口（见 app/album/[id]/page.tsx）。之后它就只由客户端持有。
 */
export function useShallowIdParam(key: string): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => readRawParam(key));

  const update = useCallback(
    (next: string | null) => {
      setValue(next);
      writeRawParam(key, next, next !== null);
    },
    [key]
  );

  useEffect(() => {
    const onPopState = () => setValue(readRawParam(key));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [key]);

  return [value, update];
}
