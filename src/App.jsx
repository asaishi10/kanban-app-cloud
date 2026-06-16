import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut, Calendar, Clock, PenTool } from 'lucide-react';

// --- Firebase のインポート ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

let firebaseConfig = {
  apiKey: "AIzaSyCqTZxvNFGf0O4_DDa7JQ45Zd8hxYKqYHY",
  authDomain: "kanban-cloud-app.firebaseapp.com",
  projectId: "kanban-cloud-app",
  storageBucket: "kanban-cloud-app.firebasestorage.app",
  messagingSenderId: "584318556014",
  appId: "1:584318556014:web:426b5fbfb962b730a7137f"
};

try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase config parsing error", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'kanban-cloud-app';
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = isConfigValid ? initializeApp(firebaseConfig) : null;
const auth = isConfigValid ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = isConfigValid ? getFirestore(app) : null;

const generateId = () => Math.random().toString(36).substr(2, 9);

// 画像圧縮処理
const compressImage = (dataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
};

// ★ URL自動リンク ＆ Markdownリンク解析コンポーネント
const LinkifiedText = ({ text, className }) => {
  const parseLinks = (str) => {
    const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = mdRegex.exec(str)) !== null) {
      if (match.index > lastIndex) parts.push({ type: 'text', content: str.substring(lastIndex, match.index) });
      parts.push({ type: 'link', text: match[1], url: match[2] });
      lastIndex = mdRegex.lastIndex;
    }
    if (lastIndex < str.length) parts.push({ type: 'text', content: str.substring(lastIndex) });
    
    const finalParts = [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    parts.forEach(p => {
      if (p.type === 'link') {
        finalParts.push(p);
      } else {
        const subParts = p.content.split(urlRegex);
        subParts.forEach(sp => {
          if (urlRegex.test(sp)) finalParts.push({ type: 'link', text: sp, url: sp });
          else if (sp) finalParts.push({ type: 'text', content: sp });
        });
      }
    });

    return finalParts.map((p, i) => 
      p.type === 'link' ? (
        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-[#00CC5B] hover:text-[#00AC4C] hover:underline font-bold break-words" onClick={(e) => e.stopPropagation()}>
          {p.text}
        </a>
      ) : (
        <span key={i}>{p.content}</span>
      )
    );
  };
  return <div className={className}>{parseLinks(text)}</div>;
};

// 期限バッジのフォーマット
const formatDueDate = (dateString) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  const isPast = d < new Date();
  const text = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return { text, isPast };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('freenote'); // デフォルトはフリーノート
  const [notes, setNotes] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [], dueDate: '', x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [dragOverIndicator, setDragOverIndicator] = useState(null);

  const [activeBlockId, setActiveBlockId] = useState(null);
  const activeBlockInfoRef = useRef({ id: null, cursorPosition: 0 });

  // フリーノート（無限キャンバス）用のStateとRef
  const freenoteRef = useRef(null);
  const [canvasDragState, setCanvasDragState] = useState(null);

  const saveCursorPosition = (e, blockId) => {
    activeBlockInfoRef.current = { id: blockId, cursorPosition: e.target.selectionStart || 0 };
    setActiveBlockId(blockId);
  };

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(t => {
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
        });
      }, 10);
    }
  }, [isModalOpen, formData.blocks]);

  const handleTextareaResize = (e) => {
    const el = e.target;
    const container = el.closest('.overflow-y-auto');
    const currentScrollTop = container ? container.scrollTop : 0;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (container) container.scrollTop = currentScrollTop;
  };

  // フリーノートの初期スクロール位置を中央へ
  useEffect(() => {
    if (activeCategoryId === 'freenote' && freenoteRef.current) {
      freenoteRef.current.scrollTop = 2500 - freenoteRef.current.clientHeight / 2;
      freenoteRef.current.scrollLeft = 2500 - freenoteRef.current.clientWidth / 2;
    }
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isConfigValid) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') alert(`【ドメイン未登録エラー】\n\nFirebase Console にて承認済みドメインを追加してください:\n\n${window.location.hostname}`);
      else alert("ログインに失敗しました。");
      setLoading(false);
    }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (e) {} };

  useEffect(() => {
    if (!user || !isConfigValid) { setCategories([]); setNotes([]); return; }
    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    let isInitialCategoryLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => a.createdAt - b.createdAt);
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: Date.now() });
      } else {
        setCategories(loadedCategories);
      }
      isInitialCategoryLoad = false;
    }, (error) => console.error(error));

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false);
    }, (error) => console.error(error));

    return () => { unsubCategories(); unsubNotes(); };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);

  const handleAddCategory = async () => {
    if (!user) return;
    const newId = generateId();
    const newCategory = { id: newId, name: '新しいボード', createdAt: Date.now() };
    await setDoc(getCategoryDoc(newId), newCategory);
    setActiveCategoryId(newId);
    setEditingCategoryId(newId);
    setEditingCategoryName(newCategory.name);
  };

  const saveCategoryName = async (id) => {
    if (!user || editingCategoryName.trim() === '') return;
    await setDoc(getCategoryDoc(id), { name: editingCategoryName.trim() }, { merge: true });
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!user || categories.length <= 1) return;
    await deleteDoc(getCategoryDoc(id));
    setActiveCategoryId('freenote');
  };

  const openAddModal = () => {
    setEditingNote(null);
    setFormData({ title: '', categoryId: activeCategoryId === 'freenote' || activeCategoryId === 'deadline' ? categories[0]?.id : activeCategoryId, blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '' });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setEditingNote(note);
    const initialBlocks = note.blocks || [{ id: generateId(), type: 'text', content: note.content || '', checked: false }];
    setFormData({ ...note, blocks: initialBlocks });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  const saveNote = async (e) => {
    if (e) e.preventDefault();
    if (!formData.title.trim() || !user) return;
    if (editingNote) {
      await setDoc(getNoteDoc(editingNote.id), formData, { merge: true });
    } else {
      const newId = generateId();
      await setDoc(getNoteDoc(newId), { ...formData, id: newId, isCompleted: false, createdAt: Date.now(), order: Date.now() });
    }
    setIsModalOpen(false);
  };

  const deleteNote = async (id) => {
    if (!user) return;
    await deleteDoc(getNoteDoc(id));
    setIsModalOpen(false);
  };

  const toggleComplete = async (e, id) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === id);
    if (note) {
      setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === noteId);
    if (note) {
      const newBlocks = note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(notes.map(n => n.id === noteId ? { ...n, blocks: newBlocks } : n));
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true });
    }
  };

  // --- ドラッグ＆ドロップ（通常ボード） ---
  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id); setDraggedNoteId(id);
    setTimeout(() => { const el = document.getElementById(`note-${id}`); if (el) el.classList.add('opacity-40'); }, 0);
  };
  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null); setDragOverIndicator(null); setDragOverCategoryId(null);
    const el = document.getElementById(`note-${id}`); if (el) el.classList.remove('opacity-40');
  };
  const handleDragOverNote = (e, id) => {
    e.preventDefault();
    if (draggedNoteId === id || activeCategoryId === 'deadline') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom';
    setDragOverIndicator({ id, position });
  };
  const handleDragLeaveNote = () => setDragOverIndicator(null);
  
  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault();
    const indicator = dragOverIndicator;
    setDragOverIndicator(null);
    if (activeCategoryId === 'deadline') return; // 期限タブは手動並べ替え無効
    
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;
    
    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    if (sourceIndex === -1) return;
    
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    
    const targetIdxAfterRemove = newCategoryNotes.findIndex(n => n.id === targetId);
    if (targetIdxAfterRemove === -1) return;
    
    const insertIndex = indicator?.position === 'top' ? targetIdxAfterRemove : targetIdxAfterRemove + 1;
    newCategoryNotes.splice(insertIndex, 0, removed);
    
    const updatedNotes = newCategoryNotes.map((note, index) => ({ ...note, order: index * 1000 }));
    setNotes(prev => [...prev.filter(n => n.categoryId !== activeCategoryId), ...updatedNotes]);
    for (const note of updatedNotes) await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
  };
  const handleCategoryDragOver = (e, categoryId) => { e.preventDefault(); if (categoryId !== activeCategoryId && categoryId !== 'deadline') setDragOverCategoryId(categoryId); };
  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault(); setDragOverCategoryId(null);
    if (targetCategoryId === 'deadline') return;
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || targetCategoryId === activeCategoryId || !user) return;
    setNotes(notes.map(n => n.id === sourceId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

  // --- ★ フリーノート（無限キャンバス）の操作 ---
  const handleFreenotePointerDown = (e, note) => {
    if (e.target.closest('.no-drag') || e.button !== 0) return;
    setCanvasDragState({ id: note.id, startX: e.clientX, startY: e.clientY, initialX: note.x || 2500, initialY: note.y || 2500 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleFreenotePointerMove = (e) => {
    if (!canvasDragState) return;
    const dx = e.clientX - canvasDragState.startX;
    const dy = e.clientY - canvasDragState.startY;
    setNotes(prev => prev.map(n => n.id === canvasDragState.id ? { ...n, x: canvasDragState.initialX + dx, y: canvasDragState.initialY + dy } : n));
  };
  const handleFreenotePointerUp = async (e) => {
    if (!canvasDragState) return;
    const targetNote = notes.find(n => n.id === canvasDragState.id);
    setCanvasDragState(null);
    if (targetNote && user) await setDoc(getNoteDoc(targetNote.id), { x: targetNote.x, y: targetNote.y }, { merge: true });
  };
  const handleFreenoteDoubleClick = (e) => {
    if (e.target !== freenoteRef.current?.firstChild) return; // 背景クリック時のみ
    const rect = freenoteRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + freenoteRef.current.scrollLeft;
    const y = e.clientY - rect.top + freenoteRef.current.scrollTop;
    
    setEditingNote(null);
    setFormData({ title: '', categoryId: 'freenote', blocks: [{ id: generateId(), type: 'text', content: '', checked: false }], dueDate: '', x, y });
    activeBlockInfoRef.current = { id: null, cursorPosition: 0 };
    setActiveBlockId(null);
    setIsModalOpen(true);
  };

  // --- ブロックエディタ ---
  const addBlock = (type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
        const targetBlock = prev.blocks[activeIdx];
        const textBefore = targetBlock.content.substring(0, cursorPosition);
        const textAfter = targetBlock.content.substring(cursorPosition);

        const newBlockId = generateId();
        const newTextId = generateId();
        const newBlocks = [...prev.blocks];

        newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
        newBlocks.splice(activeIdx + 1, 0, 
          { id: newBlockId, type, content: '', checked: false },
          { id: newTextId, type: 'text', content: textAfter, checked: false }
        );

        setTimeout(() => { const el = document.getElementById(`block-input-${newBlockId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newBlockId, cursorPosition: 0 };
        setActiveBlockId(newBlockId);
        return { ...prev, blocks: newBlocks };
      } else {
        const newId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        newBlocks.splice(insertIdx, 0, { id: newId, type, content: '', checked: false });
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const updateBlock = (blockId, updates) => setFormData(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }));
  const removeBlock = (blockId) => setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== blockId) }));

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
    
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      if (formData.blocks.length > 1) {
        removeBlock(formData.blocks[index].id);
        if (index > 0) {
          const prevBlock = formData.blocks[index - 1];
          setTimeout(() => {
            const prevInput = document.getElementById(`block-input-${prevBlock.id}`);
            if (prevInput) {
              prevInput.focus();
              const len = prevInput.value.length;
              prevInput.setSelectionRange(len, len);
            }
          }, 10);
          activeBlockInfoRef.current = { id: prevBlock.id, cursorPosition: prevBlock.content.length };
          setActiveBlockId(prevBlock.id);
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newId = generateId();
        const newBlock = { id: newId, type: blockType, content: '', checked: false };
        const newBlocks = [...formData.blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        setFormData({ ...formData, blocks: newBlocks });
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newId}`); if (el) el.focus(); }, 10);
        activeBlockInfoRef.current = { id: newId, cursorPosition: 0 };
        setActiveBlockId(newId);
      }
    }
  };

  // ★ 画像やリンクを文中に分割挿入する処理
  const insertContentIntoText = (contentData, type) => {
    setFormData(prev => {
      const { id: targetId, cursorPosition } = activeBlockInfoRef.current;
      const activeIdx = prev.blocks.findIndex(b => b.id === targetId);

      if (activeIdx !== -1 && prev.blocks[activeIdx].type === 'text') {
        const targetBlock = prev.blocks[activeIdx];
        const textBefore = targetBlock.content.substring(0, cursorPosition);
        const textAfter = targetBlock.content.substring(cursorPosition);

        const newContentId = generateId();
        const newTextId = generateId();
        const newBlocks = [...prev.blocks];

        newBlocks[activeIdx] = { ...targetBlock, content: textBefore };
        
        if (type === 'image') {
          newBlocks.splice(activeIdx + 1, 0, { id: newContentId, type: 'image', content: contentData }, { id: newTextId, type: 'text', content: textAfter, checked: false });
        } else if (type === 'text') {
          // テキスト（HTML解析後のMarkdown等）を直接挿入
          const combinedContent = textBefore + contentData + textAfter;
          newBlocks[activeIdx] = { ...targetBlock, content: combinedContent };
          activeBlockInfoRef.current = { id: targetId, cursorPosition: cursorPosition + contentData.length };
          return { ...prev, blocks: newBlocks };
        }

        setTimeout(() => { const el = document.getElementById(`block-input-${newTextId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
        setActiveBlockId(newTextId);
        return { ...prev, blocks: newBlocks };
      } else {
        const newContentId = generateId();
        const newTextId = generateId();
        const insertIdx = activeIdx !== -1 ? activeIdx + 1 : prev.blocks.length;
        const newBlocks = [...prev.blocks];
        
        if (type === 'image') {
          newBlocks.splice(insertIdx, 0, { id: newContentId, type: 'image', content: contentData }, { id: newTextId, type: 'text', content: '', checked: false });
        }
        
        setTimeout(() => { const el = document.getElementById(`block-input-${newTextId}`); if(el) el.focus(); }, 50);
        activeBlockInfoRef.current = { id: newTextId, cursorPosition: 0 };
        setActiveBlockId(newTextId);
        return { ...prev, blocks: newBlocks };
      }
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result);
      insertContentIntoText(compressedUrl, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  // ★ コピー＆ペースト対応（画像分割 ＆ ハイパーリンクMarkdown化）
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    let hasImage = false;
    
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          hasImage = true;
          const file = items[i].getAsFile();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const compressedUrl = await compressImage(reader.result);
            insertContentIntoText(compressedUrl, 'image');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }

    if (hasImage) return;

    // ハイパーリンク（HTML）のペースト対応
    const html = e.clipboardData?.getData('text/html');
    if (html && html.includes('<a ')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a');
      
      if (links.length > 0) {
        e.preventDefault();
        links.forEach(a => {
            const md = `[${a.textContent}](${a.href})`;
            a.replaceWith(document.createTextNode(md));
        });
        const plainText = doc.body.textContent || "";
        insertContentIntoText(plainText, 'text');
      }
    }
  };

  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-8 rounded-2xl shadow-lg border border-[#D7DCD9] max-w-lg w-full">
          <div className="w-16 h-16 bg-[#F7F9F8] text-[#FFE600] rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
          <h2 className="text-[20px] font-bold mb-4 text-center">Firebaseの設定が完了していません</h2>
        </div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#333333] p-6">
        <div className="bg-[#FFFFFF] p-10 rounded-3xl shadow-xl border border-[#D7DCD9] max-w-md w-full text-center">
          <div className="w-20 h-20 bg-[#E0FFEE] text-[#00CC5B] rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3"><CheckSquare className="w-10 h-10" /></div>
          <h1 className="text-[32px] font-bold mb-2 text-[#333333]">Kanban Notes</h1>
          <button onClick={handleGoogleLogin} className="mt-8 w-full flex items-center justify-center gap-[8px] bg-[#FFFFFF] border-2 border-[#D7DCD9] hover:border-[#00CC5B] hover:bg-[#F7F9F8] text-[#333333] px-6 py-4 rounded-xl font-bold text-[16px] transition-all shadow-sm">
            Googleでログインして始める
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9F8] flex flex-col items-center justify-center text-[#666666]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00CC5B] mb-4" />
        <p className="font-medium text-[16px]">同期中...</p>
      </div>
    );
  }

  // ★ 表示するメモの抽出ロジック
  let activeNotes = [];
  if (activeCategoryId === 'deadline') {
    activeNotes = notes.filter(n => n.dueDate && (showCompleted ? true : !n.isCompleted)).sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
  } else if (activeCategoryId !== 'freenote') {
    activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));
  }

  return (
    <div className="min-h-screen bg-[#F7F9F8] text-[#333333] flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700&family=Roboto:wght@500;700&display=swap');
        body { font-family: 'Roboto', 'Noto Sans JP', sans-serif; font-weight: 500; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D7DCD9; border-radius: 20px; }
      `}} />

      {/* ヘッダー */}
      <header className="bg-[#FFFFFF] border-b border-[#D7DCD9] shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-[20px] sm:text-[24px] font-bold text-[#333333] flex items-center gap-[8px]">
            Kanban Notes <span className="text-[10px] sm:text-[12px] bg-[#E0FFEE] text-[#00CC5B] px-2 py-1 rounded-full font-bold ml-1 sm:ml-2">Cloud</span>
          </h1>
          <div className="flex items-center gap-[8px] sm:gap-[16px]">
            <div className="hidden sm:flex items-center gap-[8px] text-[14px] text-[#666666] font-medium">
              {user?.photoURL && <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-[#D7DCD9]" />}
              {user?.displayName || 'ユーザー'}
            </div>
            <button onClick={handleLogout} className="p-2 text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8] rounded-lg transition-colors"><LogOut className="w-5 h-5" /></button>
            <div className="w-px h-6 bg-[#D7DCD9] mx-1"></div>
            <button onClick={() => openAddModal()} className="flex items-center justify-center bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] w-10 h-10 rounded-lg transition-colors shadow-sm" title="新規メモ">
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* カテゴリーナビ */}
        <div className="px-4 sm:px-6 flex items-end gap-[8px] overflow-x-auto custom-scrollbar pb-0">
          
          {/* ③ フリーノートタブ */}
          <div
            onClick={() => setActiveCategoryId('freenote')}
            className={`flex items-center gap-[8px] px-3 sm:px-4 py-3 border-b-[3px] transition-all cursor-pointer whitespace-nowrap
              ${activeCategoryId === 'freenote' ? 'border-[#00CC5B] text-[#00CC5B] bg-[#E0FFEE]' : 'border-transparent text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8]'}
            `}
          >
            <span className="font-bold text-[14px] sm:text-[16px] select-none flex items-center gap-1.5"><PenTool className="w-4 h-4"/> フリーノート</span>
          </div>

          {/* ⑤ 期限付きタブ */}
          <div
            onClick={() => setActiveCategoryId('deadline')}
            className={`flex items-center gap-[8px] px-3 sm:px-4 py-3 border-b-[3px] transition-all cursor-pointer whitespace-nowrap
              ${activeCategoryId === 'deadline' ? 'border-[#00CC5B] text-[#00CC5B] bg-[#E0FFEE]' : 'border-transparent text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8]'}
            `}
          >
            <span className="font-bold text-[14px] sm:text-[16px] select-none flex items-center gap-1.5"><Calendar className="w-4 h-4"/> 期限付き</span>
          </div>
          
          <div className="w-px h-6 bg-[#D7DCD9] mx-1 self-center"></div>

          {/* 通常ボードタブ */}
          {categories.map(category => (
            <div
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              onDragOver={(e) => handleCategoryDragOver(e, category.id)}
              onDragLeave={() => setDragOverCategoryId(null)}
              onDrop={(e) => handleCategoryDrop(e, category.id)}
              className={`flex items-center gap-[8px] px-3 sm:px-4 py-3 border-b-[3px] transition-all cursor-pointer whitespace-nowrap
                ${activeCategoryId === category.id ? 'border-[#00CC5B] text-[#00CC5B] bg-[#E0FFEE]' : dragOverCategoryId === category.id ? 'border-[#00AC4C] text-[#00AC4C] bg-[#E0FFEE] scale-105' : 'border-transparent text-[#666666] hover:text-[#333333] hover:bg-[#F7F9F8]'}
              `}
            >
              {editingCategoryId === category.id ? (
                <input type="text" value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onBlur={() => saveCategoryName(category.id)} onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)} autoFocus className="border border-[#00CC5B] rounded px-2 py-0.5 text-[14px] outline-none bg-[#FFFFFF] w-24 sm:w-32" />
              ) : (
                <>
                  <span className="font-bold text-[14px] sm:text-[16px] select-none">{category.name}</span>
                  {activeCategoryId === category.id && (
                    <div className="flex items-center ml-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-[#666666] hover:text-[#00CC5B] transition-colors rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      {categories.length > 1 && <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-[#666666] hover:text-[#ED1C24] transition-colors rounded"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button onClick={handleAddCategory} className="flex items-center gap-1 px-3 sm:px-4 py-3 text-[#666666] hover:text-[#00CC5B] border-b-[3px] border-transparent transition-colors font-medium text-[14px] whitespace-nowrap">
            <FolderPlus className="w-4 h-4" /> 追加
          </button>
          
          {activeCategoryId !== 'freenote' && (
            <div className="ml-auto flex items-center mb-3 pr-2 flex-shrink-0">
              <label className="flex items-center gap-[4px] cursor-pointer text-[12px] sm:text-[14px] text-[#666666] hover:text-[#333333] transition-colors select-none">
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-[#00CC5B] focus:ring-[#00CC5B]" />
                <span className="font-medium">完了を表示</span>
              </label>
            </div>
          )}
        </div>
      </header>

      {/* メイン画面 */}
      <main className="flex-1 overflow-y-auto relative bg-[#F7F9F8]">
        {activeCategoryId === 'freenote' ? (
          // ★ ③フリーノート：無限キャンバス（ダブルクリックで付箋作成）
          <div className="w-full h-full overflow-auto custom-scrollbar" ref={freenoteRef} onDoubleClick={handleFreenoteDoubleClick}>
            <div style={{ width: 5000, height: 5000, backgroundImage: 'radial-gradient(#D7DCD9 2px, transparent 2px)', backgroundSize: '30px 30px' }} className="relative pointer-events-none">
              <div className="pointer-events-auto">
                {notes.filter(n => n.categoryId === 'freenote').map(note => (
                  <div 
                    key={note.id}
                    style={{ position: 'absolute', left: note.x || 2500, top: note.y || 2500, width: 320 }}
                    onPointerDown={(e) => handleFreenotePointerDown(e, note)}
                    onPointerMove={handleFreenotePointerMove}
                    onPointerUp={handleFreenotePointerUp}
                    onPointerCancel={handleFreenotePointerUp}
                    className="bg-[#FFFFFF] rounded-xl border border-[#D7DCD9] shadow-md touch-none cursor-grab active:cursor-grabbing hover:border-[#00CC5B] transition-colors z-0 hover:z-10"
                  >
                    <div className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-[#333333] text-[16px] truncate pr-2 leading-[1.6]">{note.title || '無題'}</h3>
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(note); }} className="no-drag p-1 text-[#666666] hover:text-[#00CC5B] bg-[#F7F9F8] rounded-md shrink-0"><Edit2 className="w-4 h-4"/></button>
                      </div>
                      <div className="max-h-32 overflow-hidden relative no-drag text-[14px]">
                        {note.blocks?.slice(0, 3).map(block => (
                          <div key={block.id} className="py-0.5">
                            {block.type === 'text' && <div className="text-[#666666] line-clamp-2 leading-[1.6]">{block.content}</div>}
                            {block.type === 'list' && <div className="text-[#666666] flex gap-1 leading-[1.6]"><span className="text-[#666666] font-bold">•</span><span className="line-clamp-1">{block.content}</span></div>}
                            {block.type === 'image' && <div className="text-[#666666] flex items-center gap-1 leading-[1.6]"><ImageIcon className="w-3 h-3"/>画像</div>}
                          </div>
                        ))}
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFFFFF] to-transparent pointer-events-none"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // 通常のボード画面 または 期限付き画面
          <div className="max-w-7xl mx-auto h-full p-4 sm:p-6">
            {activeNotes.length === 0 ? (
              <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-[#D7DCD9] rounded-2xl text-[#666666] hover:border-[#00CC5B] hover:text-[#00AC4C] transition-colors cursor-pointer max-w-lg mx-auto mt-10">
                <div className="text-[18px] font-bold mb-2">メモがありません</div>
                <div className="text-[14px] font-medium">＋ ここをクリックして新しいメモを追加</div>
              </div>
            ) : (
              <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
                {activeNotes.map((note) => {
                  const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                  const dueDateInfo = formatDueDate(note.dueDate);
                  return (
                    <div
                      id={`note-${note.id}`}
                      key={note.id}
                      draggable={activeCategoryId !== 'deadline'}
                      onDragStart={(e) => handleDragStart(e, note.id)}
                      onDragEnd={(e) => handleDragEnd(e, note.id)}
                      onDragOver={(e) => handleDragOverNote(e, note.id)}
                      onDragLeave={handleDragLeaveNote}
                      onDrop={(e) => handleDropOnNote(e, note.id)}
                      onClick={() => openEditModal(note)}
                      className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 sm:p-4 transition-all cursor-pointer relative bg-[#FFFFFF] border
                        ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'top' ? 'border-t-[4px] border-t-[#00CC5B] border-b-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                        ${dragOverIndicator?.id === note.id && dragOverIndicator?.position === 'bottom' ? 'border-b-[4px] border-b-[#00CC5B] border-t-[#D7DCD9] border-x-[#D7DCD9]' : ''}
                        ${!dragOverIndicator || dragOverIndicator.id !== note.id ? 'border-[#D7DCD9] hover:border-[#00CC5B] hover:shadow-md' : ''}
                        ${note.isCompleted ? 'opacity-60 bg-[#F7F9F8]' : ''}
                      `}
                    >
                      {/* ④ 期限バッジ */}
                      {dueDateInfo && !note.isCompleted && (
                        <div className={`text-[12px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit mb-2 ${dueDateInfo.isPast ? 'bg-[#FFE600]/30 text-[#ED1C24]' : 'bg-[#E0FFEE] text-[#00AC4C]'}`}>
                          <Clock className="w-3 h-3" /> {dueDateInfo.text}
                        </div>
                      )}
                      {firstImageBlock && (
                        <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden h-24 sm:h-32 bg-[#F7F9F8] border border-[#D7DCD9] flex items-center justify-center opacity-90">
                          <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                        <h3 className={`font-bold leading-[1.6] line-clamp-2 pr-5 sm:pr-6 text-[16px] sm:text-[18px] ${note.isCompleted ? 'text-[#666666] line-through' : 'text-[#333333]'}`}>
                          {note.title}
                        </h3>
                        <button onClick={(e) => toggleComplete(e, note.id)} className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10 ${note.isCompleted ? 'text-[#00CC5B] bg-[#E0FFEE] border-[#00CC5B]' : 'text-[#C4C4C4] bg-[#FFFFFF] border-[#D7DCD9]'}`}>
                          {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5 hover:text-[#00CC5B]" />}
                        </button>
                      </div>
                      <div className="relative overflow-hidden max-h-96 rounded-b-lg">
                        <div className="space-y-0 pb-6">
                          {note.blocks?.map(block => (
                            <div key={block.id} className="py-0">
                              {/* ① URLを自動リンク化 */}
                              {block.type === 'text' && <LinkifiedText text={block.content} className={`whitespace-pre-wrap font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`} />}
                              {block.type === 'list' && (
                                <div className={`flex items-start gap-[4px] font-medium leading-[1.6] text-[14px] sm:text-[16px] ${note.isCompleted ? 'text-[#666666]' : 'text-[#333333]'}`}>
                                  <span className="text-[#666666] font-bold mt-[2px] shrink-0">•</span><span>{block.content}</span>
                                </div>
                              )}
                              {block.type === 'checkbox' && (
                                <div className="flex items-start gap-[4px] cursor-pointer group/check font-medium leading-[1.6] text-[14px] sm:text-[16px]" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                  {block.checked ? <CheckCircle2 className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#00CC5B] mt-[2px] flex-shrink-0 group-hover/check:opacity-70" /> : <Circle className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#C4C4C4] mt-[2px] flex-shrink-0 group-hover/check:text-[#00CC5B]" />}
                                  <span className={`${block.checked || note.isCompleted ? 'line-through text-[#666666]' : 'text-[#333333]'} leading-[1.6]`}>{block.content}</span>
                                </div>
                              )}
                              {block.type === 'image' && !firstImageBlock && <div className="text-[10px] sm:text-[12px] text-[#666666] flex items-center gap-[4px] my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                            </div>
                          ))}
                        </div>
                        <div className={`absolute bottom-0 left-0 right-0 h-10 sm:h-12 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-[#F7F9F8] to-transparent' : 'bg-gradient-to-t from-[#FFFFFF] to-transparent'}`}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ノート追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#333333]/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#FFFFFF] sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#D7DCD9] bg-[#F7F9F8] sm:rounded-t-2xl shrink-0 flex flex-col gap-3 z-10 relative">
              <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
                <div className="flex-1 flex items-center gap-[8px] w-full">
                  <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="flex-1 px-1 py-1 text-[20px] sm:text-[24px] font-bold text-[#333333] bg-transparent border-b-[2px] border-transparent hover:border-[#D7DCD9] focus:border-[#00CC5B] outline-none transition-colors placeholder:text-[#666666]" placeholder="タイトル" />
                  
                  {/* ④ カレンダー（日時設定）UI */}
                  <div className="flex items-center bg-[#FFFFFF] border border-[#D7DCD9] rounded-lg px-2 py-1.5 focus-within:border-[#00CC5B] transition-colors shrink-0">
                    <Calendar className="w-4 h-4 text-[#666666] mr-1 hidden sm:block" />
                    <input 
                      type="datetime-local" 
                      value={formData.dueDate || ''}
                      onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                      className="bg-transparent text-[12px] sm:text-[14px] text-[#333333] outline-none font-medium"
                    />
                  </div>

                  <select disabled={formData.categoryId === 'freenote'} value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-24 sm:w-32 px-2 sm:px-3 py-1.5 border border-[#D7DCD9] rounded-lg focus:outline-none focus:border-[#00CC5B] bg-[#FFFFFF] text-[12px] sm:text-[14px] text-[#333333] shrink-0 font-medium disabled:opacity-50">
                    <option value="freenote" className="hidden">フリーノート</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto -mt-10 sm:mt-0">
                  {editingNote && <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-[#666666] hover:text-[#ED1C24] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>}
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#666666] hover:bg-[#FFFFFF] p-1.5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-[4px] sm:gap-[8px]">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('text')} title="テキストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><AlignLeft className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('list')} title="リストを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><List className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addBlock('checkbox')} title="チェックボックスを追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><CheckSquare className="w-5 h-5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} title="画像を追加" className="p-1.5 sm:p-2 text-[#666666] hover:text-[#00CC5B] hover:bg-[#E0FFEE] rounded-lg transition-all"><ImageIcon className="w-5 h-5" /></button>
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                </div>
                <div className="flex items-center gap-[8px]">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 sm:px-4 sm:py-2 text-[#666666] bg-[#FFFFFF] border border-[#D7DCD9] hover:bg-[#E0FFEE] hover:text-[#00AC4C] hover:border-[#00CC5B] rounded-lg font-bold transition-colors text-[12px] sm:text-[14px]">キャンセル</button>
                  <button type="button" onClick={saveNote} className="px-3 py-1.5 sm:px-5 sm:py-2 bg-[#00CC5B] hover:bg-[#00AC4C] text-[#FFFFFF] rounded-lg font-bold transition-colors flex items-center gap-[4px] text-[12px] sm:text-[14px]"><Check className="w-4 h-4" /> 保存</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative bg-[#FFFFFF] sm:rounded-b-2xl">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {formData.blocks?.map((block, index) => (
                    <div key={block.id} className="flex items-start group relative">
                      <div className={`flex justify-center shrink-0 ${block.type === 'text' ? 'w-1 sm:w-0' : 'w-6 sm:w-7 pt-[6px]'}`}> 
                        {block.type === 'list' && <div className="text-[#666666] font-bold text-[18px]">•</div>}
                        {block.type === 'checkbox' && (
                          <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                            {block.checked ? <CheckSquare className="w-5 h-5 text-[#00CC5B]" /> : <Square className="w-5 h-5 text-[#C4C4C4] hover:text-[#00CC5B]" />}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 pl-1 pr-6 sm:pr-8">
                        {block.type === 'image' ? (
                          <div className="relative inline-block my-2 w-full">
                            <img src={block.content} alt="添付画像" className="max-w-full max-h-[400px] object-contain rounded-lg border border-[#D7DCD9]" />
                          </div>
                        ) : (
                          <textarea
                            id={`block-input-${block.id}`}
                            value={block.content}
                            onChange={(e) => { handleTextareaResize(e); updateBlock(block.id, { content: e.target.value }); saveCursorPosition(e, block.id); }}
                            onKeyDown={(e) => { handleKeyDown(e, index, block.type); saveCursorPosition(e, block.id); }}
                            onKeyUp={(e) => saveCursorPosition(e, block.id)}
                            onClick={(e) => saveCursorPosition(e, block.id)}
                            onFocus={(e) => saveCursorPosition(e, block.id)}
                            onPaste={handlePaste}
                            className={`w-full bg-transparent resize-none outline-none py-0.5 m-0 font-medium leading-[1.6] overflow-hidden min-h-[28px]
                              ${block.type === 'checkbox' && block.checked ? 'text-[#666666] line-through' : 'text-[#333333]'} text-[14px] sm:text-[16px]`}
                            rows={1}
                            placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                          />
                        )}
                      </div>
                      
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeBlock(block.id)} className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-[#C4C4C4] hover:text-[#ED1C24] hover:bg-[#F7F9F8] rounded transition-all" title="この行を削除">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}