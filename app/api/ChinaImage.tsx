'use client';
import React from 'react';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export default function ChinaImage({ src, alt, className, ...props }: Props) {
  // 如果是 Firebase 圖片，則加上代理 API 前綴；否則直接使用原網址
  const safeSrc = src?.includes('firebasestorage.googleapis.com') 
    ? `/api/image?url=${encodeURIComponent(src)}` 
    : src;

  return (
    <img 
      src={safeSrc} 
      alt={alt || '圖片'} 
      className={`object-cover ${className || ''}`} 
      loading="lazy"
      {...props} 
    />
  );
}
