function setupEventListeners() {
    // 表情包面板优先、独立绑定——即使其它初始化异常，也不能让表情按钮失灵
    try { initComboMenu(); } catch (e) { console.error("initComboMenu:", e); }
    try {
        initCoreListeners();
        initModalListeners();
        initChatActionListeners();
        initHeaderAndSettingsListeners();
        initDataManagementListeners();
        initNewFeatureListeners();
        setupTutorialListeners();
        initMoodListeners();
        initDecisionModule(); 
        initAnniversaryModule(); 
        initThemeEditor(); 
        initThemeSchemes();
    } catch (e) {
        console.error("事件绑定过程中发生错误:", e);
    }
}

function initChatActionListeners() {

            // ── 长按显示工具栏 ──────────────────────────────────────────
            let _longPressTimer = null;
            let _longPressTriggered = false;
            const LONG_PRESS_MS = 500;

            function _hideAllActions() {
                document.querySelectorAll('.message-wrapper.actions-visible').forEach(w => {
                    w.classList.remove('actions-visible');
                });
            }

            DOMElements.chatContainer.addEventListener('touchstart', (e) => {
                const wrapper = e.target.closest('.message-wrapper');
                if (!wrapper) return;
                // 点到工具栏按钮本身，不触发长按
                if (e.target.closest('.message-meta-actions')) return;
                _longPressTriggered = false;
                _longPressTimer = setTimeout(() => {
                    _longPressTriggered = true;
                    _hideAllActions();
                    wrapper.classList.add('actions-visible');
                    // 阻止文字选中
                    if (window.getSelection) window.getSelection().removeAllRanges();
                    // 触觉反馈
                    if (navigator.vibrate) navigator.vibrate(30);
                }, LONG_PRESS_MS);
            }, { passive: false });

            DOMElements.chatContainer.addEventListener('touchend', (e) => {
                clearTimeout(_longPressTimer);
                _longPressTimer = null;
            }, { passive: true });

            DOMElements.chatContainer.addEventListener('touchmove', (e) => {
                clearTimeout(_longPressTimer);
                _longPressTimer = null;
            }, { passive: true });

            // 点击空白处收起工具栏
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.message-wrapper')) {
                    _hideAllActions();
                }
            });

            // ── 点击语音条直接播放 ─────────────────────────────────────
            DOMElements.chatContainer.addEventListener('click', (e) => {
                // 如果是长按触发的，忽略随后的click
                if (_longPressTriggered) {
                    _longPressTriggered = false;
                    return;
                }

                const voiceBubble = e.target.closest('.voice-bubble');
                if (voiceBubble) {
                    // 直接触发voice-bubble的点击（listeners-voice.js里已有逻辑）
                    return;
                }

                // 点击气泡本身（非工具栏）不做任何事
                const wrapper = e.target.closest('.message-wrapper');
                if (wrapper && !e.target.closest('.message-meta-actions') && !e.target.closest('.voice-bubble')) {
                    // 收起工具栏
                    if (wrapper.classList.contains('actions-visible')) {
                        wrapper.classList.remove('actions-visible');
                    }
                }
            });

            DOMElements.chatContainer.addEventListener('click', (e) => {

                if (isBatchFavoriteMode) {
                    const wrapper = e.target.closest('.message-wrapper');
                    if (wrapper && !e.target.closest('.message-meta-actions')) {
                        const messageId = Number(wrapper.dataset.id);
                        const index = selectedMessages.indexOf(messageId);

                        if (index > -1) {
                            selectedMessages.splice(index, 1);
                            wrapper.classList.remove('selected');
                        } else {
                            selectedMessages.push(messageId);
                            wrapper.classList.add('selected');
                        }

                        const confirmBtn = document.getElementById('confirm-batch-favorite');
                        if (confirmBtn) {
                            confirmBtn.textContent = `确认收藏 (${selectedMessages.length})`;
                        }
                        return;
                    }
                }

                const favoriteBtn = e.target.closest('.favorite-action-btn'); 
                if (favoriteBtn) {
                    const wrapper = e.target.closest('.message-wrapper');
                    const messageId = Number(wrapper.dataset.id);
                    const message = messages.find(m => m.id === messageId);
                    
                    if (message) {
                        message.favorited = !message.favorited;
                        
                        showNotification(message.favorited ? '已收藏': '已取消收藏', 'success', 1500);
                        playSound('favorite');

                        // 收藏语音消息时，把已播放过的音频持久化（优先存云端）
                        if (message.favorited && message.voice && message.voice.fakeText) {
                            (async () => {
                                try {
                                    const key = window.favAudioKey ? window.favAudioKey(messageId) : `favAudio_${messageId}`;
                                    // 先检查本地是否已有缓存（之前存过的）
                                    const existing = await localforage.getItem(key);
                                    if (existing) return; // 已有，不重复存

                                    // 尝试从 TTS 运行时缓存拿（用户播放过才有）
                                    let audioUrl = window.voiceTTS?._getAudioCache?.(String(messageId));

                                    // 没有缓存：主动调 TTS 生成（需要 TTS 已配置）
                                    if (!audioUrl && window.voiceTTS?.isTtsReady() && message.voice.fakeText) {
                                        try {
                                            audioUrl = await window.voiceTTS.getAudioForMessage(String(messageId), message.voice.fakeText);
                                        } catch (e) {
                                            console.warn('[fav-audio] TTS 生成失败', e);
                                        }
                                    }

                                    if (!audioUrl) return; // 实在没有，放弃

                                    const buf = await fetch(audioUrl).then(r => r.arrayBuffer());
                                    const blob = new Blob([buf], { type: 'audio/mpeg' });

                                    if (window.CloudMedia && window.CloudSync && window.CloudSync.isConnected()) {
                                        try {
                                            const result = await window.CloudMedia.upload(blob, 'fav-audio', String(messageId));
                                            await localforage.setItem(key, result.url);
                                        } catch (e) {
                                            console.warn('[fav-audio] 云端上传失败，降级本地', e);
                                            const uint8 = new Uint8Array(buf);
                                            let binary = '';
                                            uint8.forEach(b => binary += String.fromCharCode(b));
                                            await localforage.setItem(key, btoa(binary));
                                        }
                                    } else {
                                        const uint8 = new Uint8Array(buf);
                                        let binary = '';
                                        uint8.forEach(b => binary += String.fromCharCode(b));
                                        await localforage.setItem(key, btoa(binary));
                                    }
                                } catch (e) {
                                    console.warn('[fav-audio] 收藏存储失败', e);
                                }
                            })();
                        }
                        // 取消收藏时删除缓存（本地 + 云端）
                        if (!message.favorited) {
                            const key = window.favAudioKey ? window.favAudioKey(messageId) : `favAudio_${messageId}`;
                            localforage.getItem(key).then(async val => {
                                if (typeof val === 'string' && val.startsWith('oss://') && window.CloudMedia) {
                                    try { await window.CloudMedia.delete(val); } catch (e) {}
                                }
                                localforage.removeItem(key).catch(() => {});
                            }).catch(() => {});
                        }
                        
                        throttledSaveData();
                        renderMessages(true);
                    }
                    return;
                }

                const target = e.target.closest('.meta-action-btn');
                if (!target) return;
                
                const wrapper = e.target.closest('.message-wrapper');
                if (!wrapper) return; 
                
                const messageId = Number(wrapper.dataset.id);
                const message = messages.find(m => m.id === messageId);
                if (!message) return;

if (target.classList.contains('delete-btn')) {
    if (confirm('确定要删除这条消息吗？')) {
        const index = messages.findIndex(m => m.id === messageId);
        if (index > -1) {
            const savedScrollTop = DOMElements.chatContainer.scrollTop;
            messages.splice(index, 1); 
            throttledSaveData(); 
            renderMessages(true);
            requestAnimationFrame(() => {
                DOMElements.chatContainer.scrollTop = savedScrollTop;
            });
            showNotification('消息已删除', 'success');
        }
    }
    return;
}
                if (target.classList.contains('reply-btn')) {
                    currentReplyTo = {
                        id: message.id,
                        sender: message.sender,
                        text: message.text,
                        image: message.image || null,
                        voice: message.voice || null
                    };
                    updateReplyPreview();
                    DOMElements.messageInput.focus();
                    const targetMessageElement = DOMElements.chatContainer.querySelector(`[data-id="${message.id}"]`);
                    if (targetMessageElement) targetMessageElement.scrollIntoView({
                        behavior: 'smooth', block: 'center'
                    });
                    return;
                } 
                throttledSaveData();
            });

            DOMElements.batchPreview.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.batch-preview-remove');
                if (removeBtn) {
                    const index = removeBtn.closest('.batch-preview-item').dataset.index;
                    batchMessages.splice(index, 1); updateBatchPreview();
                    return;
                }
                const editBtn = e.target.closest('.batch-preview-edit');
                if (editBtn) {
                    const item = editBtn.closest('.batch-preview-item');
                    const index = parseInt(item.dataset.index);
                    const msg = batchMessages[index];
                    if (!msg || msg.image) return;
                    const newText = prompt('编辑内容：', msg.text);
                    if (newText !== null) {
                        batchMessages[index].text = newText.trim();
                        updateBatchPreview();
                    }
                    return;
                }
                const sendBtn = e.target.closest('.batch-send-btn');
                if (sendBtn && !sendBtn.disabled) sendBatchMessages();
                if (e.target.matches('.batch-cancel-btn')) {
                    isBatchMode = false; DOMElements.batchBtn.classList.remove('active');
                    DOMElements.batchPreview.style.display = 'none';
                    const placeholder = "";
                    DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;
                    batchMessages = [];
                }
            });
        }

        function initModalListeners() {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                const cancelBtns = modal.querySelectorAll('.modal-buttons .modal-btn-secondary');
                cancelBtns.forEach(cancelBtn => {
                    if (!cancelBtn.getAttribute('onclick') && !cancelBtn.dataset.noAutoClose) {
                        cancelBtn.addEventListener('click', () => hideModal(modal));
                    }
                });
            });

            const closeChatBtn = document.getElementById('close-chat');
            if (closeChatBtn) {
                closeChatBtn.addEventListener('click', () => {
                    hideModal(DOMElements.chatModal.modal);
                });
            }

            const closeDataBtn = document.getElementById('close-data');
            if (closeDataBtn) {
                closeDataBtn.addEventListener('click', () => {
                    hideModal(DOMElements.dataModal.modal);
                });
            }

            DOMElements.editModal.input.addEventListener('input', () => {
                DOMElements.editModal.save.disabled = !DOMElements.editModal.input.value.trim();
            });
            DOMElements.pokeModal.save.addEventListener('click', () => {
                const verb = DOMElements.pokeModal.input.value.trim() || settings.myPokeText || '拍了拍';
                let pokeText = `${settings.myName} ${verb} ${settings.partnerName}`;
                if (typeof window._sanitizePokeTextForDisplay === 'function') {
                    pokeText = window._sanitizePokeTextForDisplay(pokeText);
                }
                const pokeSaveChecked = document.getElementById('poke-save-to-library');
                const shouldSaveToLibrary = pokeSaveChecked ? !!pokeSaveChecked.checked : false;
                addMessage({
                    id: Date.now(), text: _formatPokeText(pokeText), timestamp: new Date(), type: 'system'
                });
                if (typeof playSound === 'function') playSound('poke');

                if (shouldSaveToLibrary) {
                    try {
                        if (!Array.isArray(customPokes)) customPokes = [];
                        const exists = customPokes.some(r => String(r) === String(pokeText));
                        if (!exists) {
                            customPokes.unshift(pokeText);
                            if (typeof throttledSaveData === 'function') throttledSaveData();
                            if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
                        }
                    } catch (e) {
                        console.warn('拍一拍保存到库失败:', e);
                    }
                }
                hideModal(DOMElements.pokeModal.modal);
                DOMElements.pokeModal.input.value = settings.myPokeText || '';
                const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
                setTimeout(simulateReply, randomDelay);
            });


            DOMElements.cancelCoinResult.addEventListener('click', () => {
                DOMElements.coinTossOverlay.classList.remove('visible', 'finished');
                lastCoinResult = null;
            });


            DOMElements.sendCoinResult.addEventListener('click', () => {
                if (lastCoinResult) {
                    sendMessage(`🎲 抛硬币结果：${lastCoinResult}`, 'normal');
                    DOMElements.coinTossOverlay.classList.remove('visible', 'finished');
                    lastCoinResult = null;
                }
            });


            const retryBtn = document.getElementById('retry-coin-toss');

            if (retryBtn) {
                retryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    startCoinFlipAnimation();
                });
            }
        }


        function initHeaderAndSettingsListeners() {

            const openNameModal = (isPartner) => {
                const modal = DOMElements.editModal;
                showModal(modal.modal, modal.input);
                modal.title.textContent = `修改${isPartner ? (settings.partnerName || '对方'): '我'}的昵称`;
                modal.input.value = isPartner ? settings.partnerName: settings.myName;
                modal.save.disabled = !modal.input.value.trim();
                modal.save.onclick = () => {
                    const newName = modal.input.value.trim();
                    if (newName) {
                        isPartner ? settings.partnerName = newName: settings.myName = newName;
                        throttledSaveData();
                        updateUI();
                        showNotification('昵称已更新', 'success');
                    }
                    hideModal(modal.modal);
                };
            };

            const openAvatarModal = (isPartner) => {
                const modal = DOMElements.avatarModal;

                modal.modal.querySelector('.modal-content').innerHTML = `
            <div class="modal-title"><i class="fas fa-portrait"></i><span>上传${isPartner ? '对方': '我'}的头像</span></div>
            <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <button class="modal-btn modal-btn-secondary" id="upload-file-btn" style="flex: 1;">选择文件</button>
            <button class="modal-btn modal-btn-secondary" id="paste-url-btn" style="flex: 1;">粘贴URL</button>
            </div>
            <input type="file" class="modal-input" id="avatar-file-input" accept="image/*" style="display: none;">
            <input type="text" class="modal-input" id="avatar-url-input" placeholder="输入图片URL地址" style="display: none;">
            <div id="avatar-preview" style="text-align: center; margin-top: 10px; display: none;">
            <img id="preview-image" style="max-width: 100px; max-height: 100px; border-radius: 50%; border: 2px solid var(--border-color);">
            </div>
            </div>
            <div class="modal-buttons">
            <button class="modal-btn modal-btn-secondary" id="cancel-avatar">取消</button>
            <button class="modal-btn modal-btn-primary" id="save-avatar" disabled>保存</button>
            </div>
            `;

                showModal(modal.modal);

                const fileInput = document.getElementById('avatar-file-input');
                const urlInput = document.getElementById('avatar-url-input');
                const uploadBtn = document.getElementById('upload-file-btn');
                const pasteUrlBtn = document.getElementById('paste-url-btn');
                const previewDiv = document.getElementById('avatar-preview');
                const previewImg = document.getElementById('preview-image');
                const saveBtn = document.getElementById('save-avatar');
                const cancelBtn = document.getElementById('cancel-avatar');

                let currentAvatarData = null;


                uploadBtn.addEventListener('click', () => {
                    fileInput.click();
                    urlInput.style.display = 'none';
                    uploadBtn.classList.add('active');
                    pasteUrlBtn.classList.remove('active');
                });


                pasteUrlBtn.addEventListener('click', () => {
                    urlInput.style.display = 'block';
                    fileInput.style.display = 'none';
                    pasteUrlBtn.classList.add('active');
                    uploadBtn.classList.remove('active');
                    urlInput.focus();
                });


fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > MAX_AVATAR_SIZE) {
            showNotification('头像图片不能超过2MB', 'error');
            return;
        }

        showNotification('正在裁剪处理...', 'info', 1000);
        
        cropImageToSquare(file, 300).then(base64Data => {
            currentAvatarData = base64Data;
            previewImg.src = currentAvatarData;
            previewDiv.style.display = 'block';
            saveBtn.disabled = false;
        }).catch(err => {
            console.error(err);
            showNotification('图片处理失败', 'error');
        });
    }
});


                urlInput.addEventListener('input',
                    function() {
                        const url = urlInput.value.trim();
                        if (url) {

                            if (/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))$/i.test(url)) {
                                previewImg.src = url;
                                previewDiv.style.display = 'block';
                                currentAvatarData = url;
                                saveBtn.disabled = false;


                                const img = new Image();
                                img.onload = function() {

                                    previewImg.src = url;
                                };
                                img.onerror = function() {
                                    showNotification('图片URL无效或无法访问', 'error');
                                    saveBtn.disabled = true;
                                };
                                img.src = url;
                            } else {
                                saveBtn.disabled = true;
                            }
                        } else {
                            saveBtn.disabled = true;
                            previewDiv.style.display = 'none';
                        }
                    });


                saveBtn.addEventListener('click',
                    async () => {
                        if (currentAvatarData) {
                            updateAvatar(isPartner ? DOMElements.partner.avatar: DOMElements.me.avatar, currentAvatarData);
                            throttledSaveData();
                            showNotification('头像已更新', 'success');
                            hideModal(modal.modal);
                            // 阶段四：头像上传云端备份（失败不影响本地使用）
                            if (window.CloudMedia && window.CloudSync && window.CloudSync.isConnected()) {
                                try {
                                    const category = isPartner ? 'avatars' : 'my-avatars';
                                    const avatarId = isPartner ? 'partner' : 'me';
                                    await window.CloudMedia.upload(currentAvatarData, category, avatarId);
                                } catch (e) {
                                    console.warn('[avatar] 云端备份失败', e);
                                }
                            }
                        }
                    });


                cancelBtn.addEventListener('click',
                    () => {
                        hideModal(modal.modal);
                    });
            };

            DOMElements.partner.name.addEventListener('click', () => openNameModal(true));
            DOMElements.me.name.addEventListener('click', () => openNameModal(false));
            DOMElements.partner.avatar.addEventListener('click', () => openAvatarModal(true));
            DOMElements.me.avatar.addEventListener('click', () => openAvatarModal(false));

            DOMElements.me.statusContainer.addEventListener('click', () => {
                const statusTextElement = DOMElements.me.statusText; const statusContainer = DOMElements.me.statusContainer;
                if (statusContainer.querySelector('input')) return;
                const input = document.createElement('input'); input.type = 'text'; input.id = 'my-status-input'; input.value = statusTextElement.textContent;
                const saveStatus = () => {
                    const newStatus = input.value.trim();
                    if (newStatus) {
                        settings.myStatus = newStatus; showNotification('状态已更新', 'success');
                    } else {
                        settings.myStatus = "在线";
                    }
                    statusTextElement.textContent = settings.myStatus;
                    statusContainer.innerHTML = '';
                    statusContainer.appendChild(statusTextElement);
                    throttledSaveData();
                };
                input.addEventListener('blur', saveStatus);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') input.blur();
                });
                statusContainer.innerHTML = ''; statusContainer.appendChild(input); input.focus();
            });


            DOMElements.settingsModal.settingsBtn.addEventListener('click', () => {
                showModal(DOMElements.settingsModal.modal);
            });
            DOMElements.favoritesModal.favoritesBtn.addEventListener('click', () => {
                showModal(document.getElementById('group-chat-modal'));
            });


window.setReadReceiptStyle = function(style) {
    settings.readReceiptStyle = style;
    throttledSaveData();
    const iconBtn = document.getElementById('rr-style-icon');
    const textBtn = document.getElementById('rr-style-text');
    if (iconBtn) { iconBtn.className = style === 'icon' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; iconBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    if (textBtn) { textBtn.className = style === 'text' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; textBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    renderMessages();
    showNotification('已读回执样式已更新', 'success');
};

const _chatSettingsEl = document.getElementById('chat-settings');
if (_chatSettingsEl) _chatSettingsEl.addEventListener('click', () => {
    hideModal(DOMElements.settingsModal.modal);
    
    const toggleSyncMap = {
        '#reply-toggle': { prop: 'replyEnabled', name: '引用回复' },
        '#sound-toggle': { prop: 'soundEnabled', name: '音效' },
        '#read-receipts-toggle': { prop: 'readReceiptsEnabled', name: '已读回执' },
        '#typing-indicator-toggle': { prop: 'typingIndicatorEnabled', name: '正在输入' },
        '#read-no-reply-toggle': { prop: 'allowReadNoReply', name: '已读不回' },
        '#emoji-mix-toggle': { prop: 'emojiMixEnabled', name: '表情消息' }
    };
    for (const [selector, { prop }] of Object.entries(toggleSyncMap)) {
        const el = document.querySelector(selector);
        const val = prop === 'emojiMixEnabled' ? (settings[prop] !== false) : !!settings[prop];
        if (el) el.classList.toggle('active', val);
    }
    const svSlider = document.getElementById('sound-volume-slider');
    const svVal = document.getElementById('sound-volume-value');
    if (svSlider) { svSlider.value = Math.round((settings.soundVolume || 0.15) * 100); if (svVal) svVal.textContent = svSlider.value + '%'; }
    const legacyCustom = (settings.customSoundUrl || '').trim();

    const setSelect = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || 'tone_low';
    };
    const setInput = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    // 音频自定义值显示：base64 数据只显示友好文字
    const setSoundUrlInput = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (val && val.startsWith('data:audio')) {
            el.value = '[本地文件（已上传）]';
        } else {
            el.value = val || '';
        }
    };

    setSelect('sound-my-send-preset', settings.mySendSoundPreset || 'tone_low');
    setSoundUrlInput('sound-my-send-custom-url', (settings.mySendCustomSoundUrl || '').trim() || legacyCustom);

    setSelect('sound-partner-message-preset', settings.partnerMessageSoundPreset || 'tone_low');
    setSoundUrlInput('sound-partner-message-custom-url', (settings.partnerMessageCustomSoundUrl || '').trim() || legacyCustom);

    setSelect('sound-my-poke-preset', settings.myPokeSoundPreset || 'tone_low');
    setSoundUrlInput('sound-my-poke-custom-url', (settings.myPokeCustomSoundUrl || '').trim() || legacyCustom);
    const myPokeTextInput = document.getElementById('my-poke-text-input');
    if (myPokeTextInput) myPokeTextInput.value = settings.myPokeText || '';
    // 更新预览姓名标签
    const pokeMyName = document.getElementById('poke-preview-myname');
    const pokePartnerName = document.getElementById('poke-preview-partnername');
    const pokePreview = document.getElementById('poke-action-preview');
    if (pokeMyName) pokeMyName.textContent = settings.myName || '我';
    if (pokePartnerName) pokePartnerName.textContent = settings.partnerName || '对方';
    if (pokePreview) pokePreview.textContent = `${settings.myName || '我'} ${settings.myPokeText || '拍了拍'} ${settings.partnerName || '对方'}`;

    // 保存按钮 dirty 状态
    const myPokeSaveBtn = document.getElementById('my-poke-text-save');
    function _applyPokeSaveBtnState(isDirty) {
        if (!myPokeSaveBtn) return;
        myPokeSaveBtn.disabled = !isDirty;
        myPokeSaveBtn.textContent = isDirty ? '保存' : '已保存';
        myPokeSaveBtn.style.background = isDirty ? 'var(--accent-color)' : 'var(--border-color)';
        myPokeSaveBtn.style.color = isDirty ? '#fff' : 'var(--text-secondary)';
        myPokeSaveBtn.style.cursor = isDirty ? 'pointer' : 'not-allowed';
        myPokeSaveBtn.style.opacity = isDirty ? '1' : '0.65';
    }

    // 初始状态：已保存（未修改）
    _applyPokeSaveBtnState(false);

    // 实时预览更新 + dirty 检测
    if (myPokeTextInput) {
        myPokeTextInput.oninput = () => {
            const verb = myPokeTextInput.value.trim() || '拍了拍';
            if (pokePreview) pokePreview.textContent = `${settings.myName || '我'} ${verb} ${settings.partnerName || '对方'}`;
            // 跟已保存值比较
            const isDirty = myPokeTextInput.value.trim() !== (settings.myPokeText || '');
            _applyPokeSaveBtnState(isDirty);
        };
    }

    // 保存按钮
    if (myPokeSaveBtn) {
        myPokeSaveBtn.onclick = () => {
            if (myPokeSaveBtn.disabled) return;
            settings.myPokeText = myPokeTextInput ? myPokeTextInput.value.trim() : '';
            throttledSaveData();
            _applyPokeSaveBtnState(false);
            if (typeof showNotification === 'function') showNotification('已保存', 'success', 1500);
        };
    }

    setSelect('sound-partner-poke-preset', settings.partnerPokeSoundPreset || 'tone_low');
    setSoundUrlInput('sound-partner-poke-custom-url', (settings.partnerPokeCustomSoundUrl || '').trim() || legacyCustom);

    // 邀请音效（5 项）
    setSelect('sound-invite-study-preset', settings.inviteStudySoundPreset || 'default');
    setSoundUrlInput('sound-invite-study-custom-url', settings.inviteStudyCustomSoundUrl || '');
    setSelect('sound-invite-work-preset', settings.inviteWorkSoundPreset || 'default');
    setSoundUrlInput('sound-invite-work-custom-url', settings.inviteWorkCustomSoundUrl || '');
    setSelect('sound-invite-exercise-preset', settings.inviteExerciseSoundPreset || 'default');
    setSoundUrlInput('sound-invite-exercise-custom-url', settings.inviteExerciseCustomSoundUrl || '');
    setSelect('sound-invite-sleep-preset', settings.inviteSleepSoundPreset || 'default');
    setSoundUrlInput('sound-invite-sleep-custom-url', settings.inviteSleepCustomSoundUrl || '');
    setSelect('sound-invite-videocall-preset', settings.inviteVideocallSoundPreset || 'default');
    setSoundUrlInput('sound-invite-videocall-custom-url', settings.inviteVideocallCustomSoundUrl || '');
    document.querySelectorAll('.time-fmt-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.fmt === (settings.timeFormat || 'HH:mm'));
    });
    const autoToggle = document.getElementById('auto-send-toggle');
    if (autoToggle) autoToggle.classList.toggle('active', !!settings.autoSendEnabled);
    updateAutoSendUI();
    if (typeof updateCombineCardsUI === 'function') updateCombineCardsUI(); // 每次打开设置都重新刷新一次，跟"主动发消息"那个开关同样的做法，避免显示的还是网页刚启动、设置数据还没读完时的旧状态
    updateDelayUI();
    const immToggle = document.getElementById('immersive-toggle');
    if (immToggle) immToggle.classList.toggle('active', document.body.classList.contains('immersive-mode'));
    const rrStyle = settings.readReceiptStyle || 'icon';
    const rrIconBtn = document.getElementById('rr-style-icon');
    const rrTextBtn = document.getElementById('rr-style-text');
    if (rrIconBtn) { rrIconBtn.className = rrStyle === 'icon' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; rrIconBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    if (rrTextBtn) { rrTextBtn.className = rrStyle === 'text' ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary'; rrTextBtn.style.cssText = 'padding:5px 12px;font-size:12px;'; }
    
    showModal(DOMElements.chatModal.modal);
    setupAvatarFrameSettings();
});
            const _advancedEl = document.getElementById('advanced-settings');
            if (_advancedEl) _advancedEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                showModal(DOMElements.advancedModal.modal);
            });
            // 顶格的「高级功能」按钮：直接打开高级功能弹窗
            const _advancedHeaderEl = document.getElementById('advanced-header-btn');
            if (_advancedHeaderEl) _advancedHeaderEl.addEventListener('click', () => {
                showModal(DOMElements.advancedModal.modal);
            });
            // 高级功能里的「今日公告」入口
            const _dailyGreetingFuncEl = document.getElementById('daily-greeting-function');
            if (_dailyGreetingFuncEl) _dailyGreetingFuncEl.addEventListener('click', () => {
                hideModal(DOMElements.advancedModal.modal);
                if (typeof reopenDailyGreeting === 'function') reopenDailyGreeting();
            });

            const _dataSettingsEl = document.getElementById('data-settings');
            if (_dataSettingsEl) _dataSettingsEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                showModal(DOMElements.dataModal.modal);
            });
            const exportChatBtnDm = document.getElementById('export-chat-btn');
            const importChatBtnDm = document.getElementById('import-chat-btn');
            if (exportChatBtnDm) {
                exportChatBtnDm.addEventListener('click', () => {
                    if (typeof exportChatHistory === 'function') exportChatHistory();
                    else showNotification('功能暂不可用', 'error');
                });
            }
            if (importChatBtnDm) {
                importChatBtnDm.addEventListener('click', () => {
                    const inp = document.createElement('input');
                    inp.type = 'file'; inp.accept = '.json';
                    inp.onchange = e => { if (e.target.files[0] && typeof importChatHistory === 'function') importChatHistory(e.target.files[0]); };
                    inp.click();
                });
            }


            document.querySelectorAll('.theme-color-btn').forEach(btn => {
                btn.addEventListener('click',
                    () => {
                        settings.colorTheme = btn.dataset.theme;
                        throttledSaveData();
                        updateUI();
                        showNotification(`主题颜色已切换`, 'success');
                    });
            });


            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.addEventListener('click',
                    () => {
                        settings.bubbleStyle = item.dataset.bubbleStyle;
                        throttledSaveData();
                        updateUI();
                        showNotification(`气泡样式已切换为${getBubbleStyleName(settings.bubbleStyle)}`, 'success');
                    });
            });

            const fontUrlInput = document.getElementById('custom-font-url');
            const applyFontBtn = document.getElementById('apply-font-btn');
            
            if (fontUrlInput) fontUrlInput.value = settings.customFontUrl || "";

            if (applyFontBtn) {
                applyFontBtn.addEventListener('click', () => {
                    const url = fontUrlInput.value.trim();
                    settings.customFontUrl = url;
                    
                    showNotification('正在尝试加载字体...', 'info', 1000);
                    applyCustomFont(url).then(() => {
                        throttledSaveData();
                        if(url) showNotification('字体已应用', 'success');
                        else showNotification('已恢复默认字体', 'success');
                    });
                });
            }

            
            const followSystemBtn = document.getElementById('follow-system-font-btn');
            if (followSystemBtn) {
                followSystemBtn.addEventListener('click', () => {
                    
                    const systemFontStack = 'system-ui, -apple-system, sans-serif';
                    
                    
                    if (fontUrlInput) fontUrlInput.value = "";
                    
                    
                    settings.customFontUrl = "";
                    
                    
                    settings.messageFontFamily = systemFontStack;
                    
                    
                    document.documentElement.style.setProperty('--font-family', systemFontStack);
                    document.documentElement.style.setProperty('--message-font-family', systemFontStack);
                    
                    
                    throttledSaveData();
                    
                    
                    renderMessages(true);
                    
                    showNotification('已应用跟随系统字体', 'success');
                });
            }
            
            const cssTextarea = document.getElementById('custom-bubble-css');
            const applyCssBtn = document.getElementById('apply-css-btn');
            const resetCssBtn = document.getElementById('reset-css-btn');

            if (cssTextarea) cssTextarea.value = settings.customBubbleCss || "";

            function updateCssLivePreview() {
                const previewStyle = document.getElementById('css-live-preview-style');
                if (!previewStyle) return;
                const raw = (cssTextarea ? cssTextarea.value : '') || '';
                const scoped = raw.replace(/([^{}]+)\{/g, (match, selector) => {
                    const parts = selector.split(',').map(s => `#css-live-preview ${s.trim()}`);
                    return parts.join(', ') + ' {';
                });
                previewStyle.textContent = scoped;
            }

            if (cssTextarea) {
                cssTextarea.addEventListener('input', updateCssLivePreview);
                updateCssLivePreview();
            }

            if (applyCssBtn) {
                applyCssBtn.addEventListener('click', () => {
                    const css = cssTextarea.value;
                    settings.customBubbleCss = css;
                    applyCustomBubbleCss(css);
                    throttledSaveData();
                    showNotification('自定义样式已应用', 'success');
                });
            }

            if (resetCssBtn) {
                resetCssBtn.addEventListener('click', () => {
                    cssTextarea.value = "";
                    settings.customBubbleCss = "";
                    applyCustomBubbleCss("");
                    if (document.getElementById('css-live-preview-style')) document.getElementById('css-live-preview-style').textContent = '';
                    throttledSaveData();
                    showNotification('自定义样式已清除', 'success');
                });
            }

            const globalCssTextarea = document.getElementById('custom-global-css');
            const applyGlobalCssBtn = document.getElementById('apply-global-css-btn');
            const resetGlobalCssBtn = document.getElementById('reset-global-css-btn');
            const globalCssLiveToggle = document.getElementById('global-css-live-toggle');
            const globalCssStatus = document.getElementById('global-css-status');

            if (globalCssTextarea) {
                globalCssTextarea.value = settings.customGlobalCss || '';

                globalCssTextarea.addEventListener('input', () => {
                    if (globalCssLiveToggle && globalCssLiveToggle.checked) {
                        applyGlobalThemeCss(globalCssTextarea.value);
                        if (globalCssStatus) {
                            globalCssStatus.style.display = 'block';
                            globalCssStatus.textContent = '● 实时应用中';
                            globalCssStatus.style.color = 'var(--accent-color)';
                        }
                    }
                });
            }

            if (applyGlobalCssBtn) {
                applyGlobalCssBtn.addEventListener('click', () => {
                    const css = globalCssTextarea ? globalCssTextarea.value : '';
                    settings.customGlobalCss = css;
                    applyGlobalThemeCss(css);
                    throttledSaveData();
                    showNotification('全局主题 CSS 已应用', 'success');
                    if (globalCssStatus) {
                        globalCssStatus.style.display = 'block';
                        globalCssStatus.textContent = '✓ 已应用到全局';
                        globalCssStatus.style.color = '#51cf66';
                        setTimeout(() => { if (globalCssStatus) globalCssStatus.style.display = 'none'; }, 2000);
                    }
                });
            }

            if (resetGlobalCssBtn) {
                resetGlobalCssBtn.addEventListener('click', () => {
                    if (globalCssTextarea) globalCssTextarea.value = '';
                    settings.customGlobalCss = '';
                    applyGlobalThemeCss('');
                    throttledSaveData();
                    showNotification('全局主题 CSS 已清除', 'success');
                    if (globalCssStatus) globalCssStatus.style.display = 'none';
                });
            }

            const fontSizeSlider = document.getElementById('font-size-slider');
            const fontSizeValue = document.getElementById('font-size-value');

            fontSizeSlider.value = settings.fontSize;
            fontSizeValue.textContent = `${settings.fontSize}px`;

            fontSizeSlider.addEventListener('input', (e) => {
                settings.fontSize = parseInt(e.target.value);
                document.documentElement.style.setProperty('--font-size',
                    `${settings.fontSize}px`);
                fontSizeValue.textContent = `${settings.fontSize}px`;
            });

            fontSizeSlider.addEventListener('change', throttledSaveData);

            const avatarToggle = document.getElementById('in-chat-avatar-toggle-2');
            const avatarSizeControl = document.getElementById('in-chat-avatar-size-control-2');
            const avatarPositionControl = document.getElementById('in-chat-avatar-position-control-2');
            const avatarPreview = document.getElementById('avatar-bubble-preview');
            const avatarSizeSlider = document.getElementById('in-chat-avatar-size-slider-2');
            const avatarSizeValue = document.getElementById('in-chat-avatar-size-value-2');

            if (!settings.inChatAvatarPosition) settings.inChatAvatarPosition = 'center';


            function updateBubblePreview() {
                const receivedBubble = document.getElementById('preview-bubble-received');
                const sentBubble = document.getElementById('preview-bubble-sent');
                if (!receivedBubble || !sentBubble) return;
                const style = settings.bubbleStyle || 'standard';
                const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-color-rgb').trim() || '100,150,255';
                const styleMap = {
                    'standard':      { recv: '16px 16px 16px 4px',  sent: '16px 16px 4px 16px',  recvShadow: '0 2px 10px rgba(0,0,0,0.08)', sentShadow: `0 3px 12px rgba(${accentRgb},0.22)` },
                    'rounded':       { recv: '18px 18px 18px 6px',  sent: '18px 18px 6px 18px',  recvShadow: '0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)', sentShadow: `0 3px 12px rgba(${accentRgb},0.25), 0 1px 3px rgba(${accentRgb},0.1)` },
                    'rounded-large': { recv: '24px 24px 24px 4px',  sent: '24px 24px 4px 24px',  recvShadow: '0 4px 16px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.05)', sentShadow: `0 4px 16px rgba(${accentRgb},0.28), 0 2px 4px rgba(${accentRgb},0.12)` },
                    'square':        { recv: '4px 4px 4px 0',       sent: '4px 4px 0 4px',       recvShadow: '0 3px 10px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)', sentShadow: `0 3px 10px rgba(${accentRgb},0.2), 0 1px 2px rgba(${accentRgb},0.08)` }
                };
                const radii = styleMap[style] || styleMap['standard'];
                receivedBubble.style.borderRadius = radii.recv;
                receivedBubble.style.boxShadow = radii.recvShadow;
                sentBubble.style.borderRadius = radii.sent;
                sentBubble.style.boxShadow = radii.sentShadow;
                const recvBg = getComputedStyle(document.documentElement).getPropertyValue('--message-received-bg').trim();
                const recvText = getComputedStyle(document.documentElement).getPropertyValue('--message-received-text').trim();
                const sentBg = getComputedStyle(document.documentElement).getPropertyValue('--message-sent-bg').trim();
                const sentText = getComputedStyle(document.documentElement).getPropertyValue('--message-sent-text').trim();
                if (recvBg) receivedBubble.style.background = recvBg;
                if (recvText) receivedBubble.style.color = recvText;
                if (sentBg) sentBubble.style.background = sentBg;
                if (sentText) sentBubble.style.color = sentText;
                receivedBubble.style.fontFamily = settings.messageFontFamily || '';
                sentBubble.style.fontFamily = settings.messageFontFamily || '';
                receivedBubble.style.fontSize = (settings.fontSize || 16) + 'px';
                sentBubble.style.fontSize = (settings.fontSize || 16) + 'px';
                const customCss = (document.getElementById('custom-bubble-css') || {}).value || '';
                let previewStyle = document.getElementById('bubble-preview-custom-style');
                if (!previewStyle) {
                    previewStyle = document.createElement('style');
                    previewStyle.id = 'bubble-preview-custom-style';
                    document.head.appendChild(previewStyle);
                }
                previewStyle.textContent = customCss;
            }

            function updateAvatarSettingsUI() {
                const enabled = settings.inChatAvatarEnabled;
                const pill = document.getElementById('avatar-toggle-pill-2');
                const knob = document.getElementById('avatar-toggle-knob-2');
                const statusText = document.getElementById('avatar-toggle-status-2');
                if (pill) pill.style.background = enabled ? 'var(--accent-color)' : 'var(--border-color)';
                if (knob) knob.style.right = enabled ? '3px' : '23px';
                if (statusText) statusText.textContent = enabled ? '已开启 — 消息旁显示头像' : '已关闭';

                if (avatarSizeControl) avatarSizeControl.style.display = enabled ? 'flex' : 'none';
                if (avatarPositionControl) avatarPositionControl.style.display = enabled ? 'block' : 'none';
                if (avatarPreview) avatarPreview.style.display = enabled ? 'block' : 'none';

                if (avatarSizeSlider) avatarSizeSlider.value = settings.inChatAvatarSize;
                if (avatarSizeValue) avatarSizeValue.textContent = `${settings.inChatAvatarSize}px`;
                document.documentElement.style.setProperty('--in-chat-avatar-size', `${settings.inChatAvatarSize}px`);

                const pos = settings.inChatAvatarPosition || 'center';
                const alignMap = { 'top': 'flex-start', 'center': 'center', 'bottom': 'flex-end', 'custom': 'flex-start' };
                document.documentElement.style.setProperty('--avatar-align', alignMap[pos] || 'center');
                document.body.dataset.avatarPos = pos;
                document.querySelectorAll('.preview-msg-row').forEach(row => {
                    row.style.alignItems = alignMap[pos] || 'flex-start';
                });
                const topBtn = document.getElementById('avatar-pos-top-2');
                const centerBtn = document.getElementById('avatar-pos-center-2');
                const bottomBtn = document.getElementById('avatar-pos-bottom-2');
                const customBtn = document.getElementById('avatar-pos-custom-2');
                [topBtn, centerBtn, bottomBtn, customBtn].forEach(btn => {
                    if (!btn) return;
                    btn.className = btn.dataset.pos === pos ? 'modal-btn modal-btn-primary' : 'modal-btn modal-btn-secondary';
                    btn.style.flex = '1'; btn.style.fontSize = '12px'; btn.style.padding = '7px 0';
                });

                const customOffsetCtrl = document.getElementById('avatar-custom-offset-control');
                if (customOffsetCtrl) customOffsetCtrl.style.display = pos === 'custom' ? 'block' : 'none';
                if (pos === 'custom') {
                    const offset = settings.inChatAvatarCustomOffset || 0;
                    document.documentElement.style.setProperty('--avatar-custom-offset', offset + 'px');
                    const sl = document.getElementById('avatar-custom-offset-slider');
                    const vl = document.getElementById('avatar-custom-offset-value');
                    if (sl) sl.value = offset;
                    if (vl) vl.textContent = offset + 'px';
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = offset + 'px';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = offset + 'px';
                } else {
                    document.documentElement.style.removeProperty('--avatar-custom-offset');
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = '';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = '';
                }

                const alwaysPill = document.getElementById('always-avatar-pill');
                const alwaysKnob = document.getElementById('always-avatar-knob');
                const alwaysStatus = document.getElementById('always-avatar-status');
                const alwaysOn = !!settings.alwaysShowAvatar;
                if (alwaysPill) alwaysPill.style.background = alwaysOn ? 'var(--accent-color)' : 'var(--border-color)';
                if (alwaysKnob) alwaysKnob.style.right = alwaysOn ? '3px' : '23px';
                if (alwaysStatus) alwaysStatus.textContent = alwaysOn ? '已开启 — 每条消息都显示头像' : '已关闭 — 仅首条消息显示';
                document.body.classList.toggle('always-show-avatar', alwaysOn);

                const namePill = document.getElementById('partner-name-chat-pill');
                const nameKnob = document.getElementById('partner-name-chat-knob');
                const nameStatus = document.getElementById('partner-name-chat-status');
                const nameOn = !!settings.showPartnerNameInChat;
                if (namePill) namePill.style.background = nameOn ? 'var(--accent-color)' : 'var(--border-color)';
                if (nameKnob) nameKnob.style.right = nameOn ? '3px' : '23px';
                if (nameStatus) nameStatus.textContent = nameOn ? '已开启 — 消息旁显示对方名字' : '已关闭';
                showPartnerNameInChat = nameOn;
                document.body.classList.toggle('show-partner-name', nameOn);

                updateAvatarPreview();
            }
            updateAvatarSettingsUI();

            if (avatarToggle) {
                avatarToggle.addEventListener('click', () => {
                    settings.inChatAvatarEnabled = !settings.inChatAvatarEnabled;
                    updateAvatarSettingsUI();
                    renderMessages(true);
                    throttledSaveData();
                });
            }

            if (avatarSizeSlider) {
                avatarSizeSlider.addEventListener('input', (e) => {
                    settings.inChatAvatarSize = parseInt(e.target.value, 10);
                    updateAvatarSettingsUI();
                    renderMessages(true); 
                });
                avatarSizeSlider.addEventListener('change', throttledSaveData);
            }

            ['avatar-pos-top-2','avatar-pos-center-2','avatar-pos-bottom-2','avatar-pos-custom-2'].forEach(btnId => {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.addEventListener('click', () => {
                        settings.inChatAvatarPosition = btn.dataset.pos;
                        updateAvatarSettingsUI();
                        renderMessages(true);
                        throttledSaveData();
                    });
                }
            });

            const customOffsetSlider = document.getElementById('avatar-custom-offset-slider');
            const customOffsetValue = document.getElementById('avatar-custom-offset-value');
            if (customOffsetSlider) {
                customOffsetSlider.value = settings.inChatAvatarCustomOffset || 0;
                if (customOffsetValue) customOffsetValue.textContent = (settings.inChatAvatarCustomOffset || 0) + 'px';
                customOffsetSlider.addEventListener('input', () => {
                    const val = parseInt(customOffsetSlider.value, 10);
                    settings.inChatAvatarCustomOffset = val;
                    if (customOffsetValue) customOffsetValue.textContent = val + 'px';
                    document.documentElement.style.setProperty('--avatar-custom-offset', val + 'px');
                    document.querySelectorAll('.preview-msg-row').forEach(row => {
                        row.style.alignItems = 'flex-start';
                    });
                    const previewPartner = document.getElementById('preview-partner-avatar');
                    if (previewPartner) previewPartner.style.marginTop = val + 'px';
                    const previewMy = document.getElementById('preview-my-avatar');
                    if (previewMy) previewMy.style.marginTop = val + 'px';
                    renderMessages(true);
                });
                customOffsetSlider.addEventListener('change', throttledSaveData);
            }

            const alwaysAvatarToggle = document.getElementById('always-avatar-toggle');
            if (alwaysAvatarToggle) {
                alwaysAvatarToggle.addEventListener('click', () => {
                    settings.alwaysShowAvatar = !settings.alwaysShowAvatar;
                    updateAvatarSettingsUI();
                    renderMessages(true);
                    throttledSaveData();
                });
            }

            const partnerNameChatToggle = document.getElementById('partner-name-chat-toggle');
            if (partnerNameChatToggle) {
                partnerNameChatToggle.addEventListener('click', () => {
                    settings.showPartnerNameInChat = !settings.showPartnerNameInChat;
                    updateAvatarSettingsUI();
                    throttledSaveData();
                });
            }

            function updateAvatarPreview(shape, cornerRadius) {
                const previewPartner = document.getElementById('preview-partner-avatar');
                const previewMy = document.getElementById('preview-my-avatar');
                if (!previewPartner || !previewMy) return;
                const sz = `${settings.inChatAvatarSize || 36}px`;
                previewPartner.style.width = sz;
                previewPartner.style.height = sz;
                previewMy.style.width = sz;
                previewMy.style.height = sz;
                const partnerImg = DOMElements.partner && DOMElements.partner.avatar ? DOMElements.partner.avatar.querySelector('img') : null;
                const myImg = DOMElements.me && DOMElements.me.avatar ? DOMElements.me.avatar.querySelector('img') : null;
                const currentShape = shape || settings.myAvatarShape || 'circle';
                
                function applyToPreviewEl(el, img, shp, cr) {
                    if (img && img.src) {
                        el.innerHTML = `<img src="${img.src}" style="width:100%;height:100%;object-fit:cover;">`;
                    }
                    if (shp === 'circle') {
                        el.style.borderRadius = '50%';
                    } else if (shp === 'square') {
                        el.style.borderRadius = (cr || 8) + 'px';
                    }
                }
                const cr = cornerRadius !== undefined ? cornerRadius : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--avatar-corner-radius') || '8') || 8;
                applyToPreviewEl(previewPartner, partnerImg, currentShape, cr);
                applyToPreviewEl(previewMy, myImg, currentShape, cr);
                if (typeof updateBubblePreview === 'function') updateBubblePreview();
            }

            function updateAvatarShapeBtns() {
                const shape = settings.myAvatarShape || 'circle';
                document.querySelectorAll('.avatar-shape-btn-2').forEach(b => {
                    b.classList.toggle('modal-btn-primary', b.dataset.shape === shape);
                    b.classList.toggle('modal-btn-secondary', b.dataset.shape !== shape);
                });
                const radiusCtrl = document.getElementById('avatar-corner-radius-control-2');
                if (radiusCtrl) radiusCtrl.style.display = shape === 'square' ? '' : 'none';
                updateAvatarPreview(shape);
            }
            document.querySelectorAll('.avatar-shape-btn-2').forEach(btn => {
                btn.addEventListener('click', () => {
                    const shape = btn.dataset.shape;
                    settings.myAvatarShape = shape;
                    settings.partnerAvatarShape = shape;
                    applyAvatarShapeToDOM && applyAvatarShapeToDOM('my', shape);
                    applyAvatarShapeToDOM && applyAvatarShapeToDOM('partner', shape);
                    updateAvatarShapeBtns();
                    updateAvatarPreview(shape);
                    renderMessages(true);
                    throttledSaveData();
                });
            });
            const cornerSlider = document.getElementById('avatar-corner-radius-slider-2');
            const cornerVal = document.getElementById('avatar-corner-radius-value-2');
            if (cornerSlider) {
                cornerSlider.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--avatar-corner-radius') || '8') || 8;
                if (cornerVal) cornerVal.textContent = cornerSlider.value + 'px';
                cornerSlider.addEventListener('input', () => {
                    const r = cornerSlider.value;
                    if (cornerVal) cornerVal.textContent = r + 'px';
                    document.documentElement.style.setProperty('--avatar-corner-radius', r + 'px');
                    updateAvatarPreview(settings.myAvatarShape || 'circle', parseInt(r));
                    renderMessages(true);
                });
                cornerSlider.addEventListener('change', () => {
                    settings.avatarCornerRadius = cornerSlider.value;
                    throttledSaveData();
                });
            }
            updateAvatarShapeBtns();

            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.addEventListener('click', () => {
                    setTimeout(updateBubblePreview, 100);
                });
            });
            
            const minDelaySlider = document.getElementById('reply-delay-min-slider');
            const minDelayValue = document.getElementById('reply-delay-min-value');
            const maxDelaySlider = document.getElementById('reply-delay-max-slider');
            const maxDelayValue = document.getElementById('reply-delay-max-value');

            window.switchCsTab = function switchCsTab(btn) {
                document.querySelectorAll('.cs-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.cs-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById(btn.dataset.panel);
                if (panel) panel.classList.add('active');
            };

            function updateDelayUI() {
                minDelaySlider.value = settings.replyDelayMin;
                const minSec = settings.replyDelayMin / 1000;
                minDelayValue.textContent = minSec >= 60 ? `${(minSec/60).toFixed(1)}分钟` : `${minSec.toFixed(0)}s`;
                maxDelaySlider.value = settings.replyDelayMax;
                const maxSec = settings.replyDelayMax / 1000;
                maxDelayValue.textContent = maxSec >= 60 ? `${(maxSec/60).toFixed(1)}分钟` : `${maxSec.toFixed(0)}s`;
                maxDelaySlider.min = settings.replyDelayMin; 
            }
            updateDelayUI();

            minDelaySlider.addEventListener('input', (e) => {
                settings.replyDelayMin = parseInt(e.target.value, 10);
                if (settings.replyDelayMin > settings.replyDelayMax) {
                    settings.replyDelayMax = settings.replyDelayMin;
                }
                updateDelayUI();
            });
            minDelaySlider.addEventListener('change', throttledSaveData);

            maxDelaySlider.addEventListener('input', (e) => {
                settings.replyDelayMax = parseInt(e.target.value, 10);
                 if (settings.replyDelayMax < settings.replyDelayMin) {
                    settings.replyDelayMin = settings.replyDelayMax;
                }
                updateDelayUI();
            });
            maxDelaySlider.addEventListener('change', throttledSaveData);

            const settingToggles = {
                '#reply-toggle': {
                    prop: 'replyEnabled', name: '引用回复'
                },
                '#sound-toggle': {
                    prop: 'soundEnabled', name: '音效'
                },
                '#read-receipts-toggle': {
                    prop: 'readReceiptsEnabled', name: '已读回执'
                },
                '#typing-indicator-toggle': {
                    prop: 'typingIndicatorEnabled', name: '正在输入'},
                    '#read-no-reply-toggle': { prop: 'allowReadNoReply', name: '已读不回' },
                    '#emoji-mix-toggle': { prop: 'emojiMixEnabled', name: '表情混入消息' }
};

            for (const [selector, {
                prop, name
            }] of Object.entries(settingToggles)) {
                const element = document.querySelector(selector);
                if (!element) continue;

                const _initVal = prop === 'emojiMixEnabled' ? (settings[prop] !== false) : !!settings[prop];
                element.classList.toggle('active', _initVal);

                element.addEventListener('click', () => {
                    if (prop === 'emojiMixEnabled' && settings[prop] === undefined) settings[prop] = true;
                    settings[prop] = !settings[prop];
                    throttledSaveData();
                    updateUI();
                    element.classList.toggle('active', !!settings[prop]);
                    if (prop !== 'soundEnabled') renderMessages(true);
                    showNotification(`${name}已${settings[prop] ? '开启': '关闭'}`, 'success');
                });
            }

            const soundVolSlider = document.getElementById('sound-volume-slider');
            const soundVolVal = document.getElementById('sound-volume-value');
            if (soundVolSlider) {
                soundVolSlider.value = Math.round((settings.soundVolume || 0.15) * 100);
                if (soundVolVal) soundVolVal.textContent = soundVolSlider.value + '%';
                soundVolSlider.addEventListener('input', (e) => {
                    settings.soundVolume = parseInt(e.target.value) / 100;
                    if (soundVolVal) soundVolVal.textContent = e.target.value + '%';
                });
                soundVolSlider.addEventListener('change', throttledSaveData);
            }

            const bindPresetSelect = (selectId, settingsKey) => {
                const el = document.getElementById(selectId);
                if (!el) return;
                el.value = settings[settingsKey] || 'tone_default';
                el.addEventListener('change', () => {
                    settings[settingsKey] = el.value || 'tone_default';
                    throttledSaveData();
                });
            };

            bindPresetSelect('sound-my-send-preset', 'mySendSoundPreset');
            bindPresetSelect('sound-partner-message-preset', 'partnerMessageSoundPreset');
            bindPresetSelect('sound-my-poke-preset', 'myPokeSoundPreset');
            bindPresetSelect('sound-partner-poke-preset', 'partnerPokeSoundPreset');
            bindPresetSelect('sound-invite-study-preset', 'inviteStudySoundPreset');
            bindPresetSelect('sound-invite-work-preset', 'inviteWorkSoundPreset');
            bindPresetSelect('sound-invite-exercise-preset', 'inviteExerciseSoundPreset');
            bindPresetSelect('sound-invite-sleep-preset', 'inviteSleepSoundPreset');
            bindPresetSelect('sound-invite-videocall-preset', 'inviteVideocallSoundPreset');

            const bindCustomUrlInput = (inputId, settingsKey) => {
                const el = document.getElementById(inputId);
                if (!el) return;
                el.addEventListener('change', () => {
                    const val = el.value.trim();
                    // 如果是本地文件占位文字，不覆盖 settings（保留 base64）
                    if (val === '[本地文件（已上传）]') return;
                    // 如果清空了，同时清除可能存在的 base64
                    settings[settingsKey] = val;
                    throttledSaveData();
                });
            };

            bindCustomUrlInput('sound-my-send-custom-url', 'mySendCustomSoundUrl');
            bindCustomUrlInput('sound-partner-message-custom-url', 'partnerMessageCustomSoundUrl');
            bindCustomUrlInput('sound-my-poke-custom-url', 'myPokeCustomSoundUrl');
            bindCustomUrlInput('sound-partner-poke-custom-url', 'partnerPokeCustomSoundUrl');
            bindCustomUrlInput('sound-invite-study-custom-url', 'inviteStudyCustomSoundUrl');
            bindCustomUrlInput('sound-invite-work-custom-url', 'inviteWorkCustomSoundUrl');
            bindCustomUrlInput('sound-invite-exercise-custom-url', 'inviteExerciseCustomSoundUrl');
            bindCustomUrlInput('sound-invite-sleep-custom-url', 'inviteSleepCustomSoundUrl');
            bindCustomUrlInput('sound-invite-videocall-custom-url', 'inviteVideocallCustomSoundUrl');

            // 本地音频文件上传
            const bindAudioUpload = (btnId, fileInputId, urlInputId, settingsKey, presetSelectId) => {
                const btn = document.getElementById(btnId);
                const fileInput = document.getElementById(fileInputId);
                const urlInput = document.getElementById(urlInputId);
                if (!btn || !fileInput) return;
                btn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', () => {
                    const file = fileInput.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64 = e.target.result;
                        settings[settingsKey] = base64;
                        if (urlInput) urlInput.value = '[本地文件: ' + file.name + ']';
                        // 将 preset 切换到 custom（如果当前是 mute 则保持，否则不强制切换）
                        const sel = document.getElementById(presetSelectId);
                        if (sel && sel.value === 'mute') {
                            // 保持 mute，用户可手动切换
                        }
                        throttledSaveData();
                    };
                    reader.readAsDataURL(file);
                    fileInput.value = ''; // 允许重复选同一文件
                });
            };

            bindAudioUpload('upload-sound-my-send-btn', 'upload-sound-my-send-file', 'sound-my-send-custom-url', 'mySendCustomSoundUrl', 'sound-my-send-preset');
            bindAudioUpload('upload-sound-partner-message-btn', 'upload-sound-partner-message-file', 'sound-partner-message-custom-url', 'partnerMessageCustomSoundUrl', 'sound-partner-message-preset');
            bindAudioUpload('upload-sound-my-poke-btn', 'upload-sound-my-poke-file', 'sound-my-poke-custom-url', 'myPokeCustomSoundUrl', 'sound-my-poke-preset');
            bindAudioUpload('upload-sound-partner-poke-btn', 'upload-sound-partner-poke-file', 'sound-partner-poke-custom-url', 'partnerPokeCustomSoundUrl', 'sound-partner-poke-preset');
            bindAudioUpload('upload-sound-invite-study-btn', 'upload-sound-invite-study-file', 'sound-invite-study-custom-url', 'inviteStudyCustomSoundUrl', 'sound-invite-study-preset');
            bindAudioUpload('upload-sound-invite-work-btn', 'upload-sound-invite-work-file', 'sound-invite-work-custom-url', 'inviteWorkCustomSoundUrl', 'sound-invite-work-preset');
            bindAudioUpload('upload-sound-invite-exercise-btn', 'upload-sound-invite-exercise-file', 'sound-invite-exercise-custom-url', 'inviteExerciseCustomSoundUrl', 'sound-invite-exercise-preset');
            bindAudioUpload('upload-sound-invite-sleep-btn', 'upload-sound-invite-sleep-file', 'sound-invite-sleep-custom-url', 'inviteSleepCustomSoundUrl', 'sound-invite-sleep-preset');
            bindAudioUpload('upload-sound-invite-videocall-btn', 'upload-sound-invite-videocall-file', 'sound-invite-videocall-custom-url', 'inviteVideocallCustomSoundUrl', 'sound-invite-videocall-preset');

            const btnMySend = document.getElementById('test-sound-my-send-btn');
            if (btnMySend) btnMySend.addEventListener('click', () => playSound('my_send'));

            const btnPartnerMsg = document.getElementById('test-sound-partner-message-btn');
            if (btnPartnerMsg) btnPartnerMsg.addEventListener('click', () => playSound('partner_message'));

            const btnMyPoke = document.getElementById('test-sound-my-poke-btn');
            if (btnMyPoke) btnMyPoke.addEventListener('click', () => playSound('my_poke'));

            const btnPartnerPoke = document.getElementById('test-sound-partner-poke-btn');
            if (btnPartnerPoke) btnPartnerPoke.addEventListener('click', () => playSound('partner_poke'));

            // 邀请音效试听按钮：再次点击暂停 + 不循环（关闭弹窗也会停止，见下方监听）
            const inviteSoundTests = [
                ['test-sound-invite-study-btn', 'invite_study'],
                ['test-sound-invite-work-btn', 'invite_work'],
                ['test-sound-invite-exercise-btn', 'invite_exercise'],
                ['test-sound-invite-sleep-btn', 'invite_sleep'],
                ['test-sound-invite-videocall-btn', 'invite_videocall']
            ];
            // 记录当前哪个邀请音效正在试听
            let _currentInvitePreviewBtnId = null;
            inviteSoundTests.forEach(([btnId, soundType]) => {
                const btn = document.getElementById(btnId);
                if (!btn) return;
                btn.addEventListener('click', () => {
                    // 如果当前按钮正在试听，则停止
                    if (_currentInvitePreviewBtnId === btnId) {
                        if (typeof window.stopCurrentSound === 'function') window.stopCurrentSound();
                        _currentInvitePreviewBtnId = null;
                        return;
                    }
                    // 否则停止其他、开始本按钮（不循环）
                    if (typeof window.stopCurrentSound === 'function') window.stopCurrentSound();
                    playSound(soundType, false);
                    _currentInvitePreviewBtnId = btnId;
                });
            });
            // 关闭聊天设置弹窗时停止试听
            const chatModalCloseBtn = document.getElementById('close-chat');
            if (chatModalCloseBtn) {
                chatModalCloseBtn.addEventListener('click', () => {
                    if (typeof window.stopCurrentSound === 'function') window.stopCurrentSound();
                    _currentInvitePreviewBtnId = null;
                });
            }

            document.querySelectorAll('.time-fmt-opt').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.fmt === (settings.timeFormat || 'HH:mm'));
                opt.addEventListener('click', () => {
                    document.querySelectorAll('.time-fmt-opt').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    settings.timeFormat = opt.dataset.fmt;
                    throttledSaveData();
                    renderMessages(true);
                    showNotification('时间格式已更新', 'success');
                });
            });


            const _appearanceEl = document.getElementById('appearance-settings');
            if (_appearanceEl) _appearanceEl.addEventListener('click', () => {
                hideModal(DOMElements.settingsModal.modal);
                window.hideAppearancePanel && window.hideAppearancePanel();
                renderBackgroundGallery();
                renderThemeSchemesList();
                if (typeof window.renderDiaryBgGallery === 'function') window.renderDiaryBgGallery();
                
                const fontSizeSliderEl = document.getElementById('font-size-slider');
                const fontSizeValueEl = document.getElementById('font-size-value');
                if (fontSizeSliderEl) {
                    fontSizeSliderEl.value = settings.fontSize;
                    if (fontSizeValueEl) fontSizeValueEl.textContent = `${settings.fontSize}px`;
                }
                const fontUrlInputEl = document.getElementById('custom-font-url');
                if (fontUrlInputEl) fontUrlInputEl.value = settings.customFontUrl || '';
                const cssTextareaEl = document.getElementById('custom-bubble-css');
                if (cssTextareaEl) cssTextareaEl.value = settings.customBubbleCss || '';
                const globalCssTextareaEl = document.getElementById('custom-global-css');
                if (globalCssTextareaEl) globalCssTextareaEl.value = settings.customGlobalCss || '';
                
                document.querySelectorAll('[data-bubble-style]').forEach(item => {
                    item.classList.toggle('active', item.dataset.bubbleStyle === settings.bubbleStyle);
                });
                
                document.querySelectorAll('.theme-color-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.theme === settings.colorTheme);
                });
                
                showModal(DOMElements.appearanceModal.modal);
                setTimeout(() => { 
                    updateAvatarSettingsUI && updateAvatarSettingsUI(); 
                    setupAppearancePanelFrameSettings && setupAppearancePanelFrameSettings();
                }, 100);
            });
            DOMElements.appearanceModal.closeBtn.addEventListener('click', () => {
                    hideModal(DOMElements.appearanceModal.modal);
                });

            const bgInput = document.getElementById('bg-gallery-input');
            if (bgInput) {
                bgInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                        showNotification('背景图片不能超过10MB', 'error');
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showNotification('文件较大，正在处理中...', 'info', 2000);
                    }
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64 = event.target.result;
                        const bgType = file.type === 'image/gif' ? 'gif' : 'image';
                        const bgId = `user-${Date.now()}`;

                        // 本地永远存全尺寸 base64（保证离线/刷新后立刻显示）
                        // 云端上传一份备份 + 生成缩略图（供图库预览 + 换设备恢复）
                        let stored = { id: bgId, type: bgType, value: base64 };
                        if (window.CloudMedia && window.CloudSync && window.CloudSync.isConnected()) {
                            showNotification('正在上传到云端...', 'info', 2000);
                            try {
                                const uploadResult = await window.CloudMedia.upload(base64, 'backgrounds', bgId);
                                let thumb = null;
                                try {
                                    thumb = await window.CloudMedia.makeThumbnail(base64, 200);
                                } catch (thumbErr) {
                                    console.warn('[cloud-media] 缩略图生成失败', thumbErr);
                                }
                                // value 保持本地 base64；cloudKey/cloudUrl/thumbnail 存云端信息
                                stored = {
                                    id: bgId,
                                    type: bgType,
                                    value: base64,             // 本地全尺寸（刷新立刻显示）
                                    thumbnail: thumb,           // 缩略图（图库预览）
                                    cloudKey: uploadResult.key, // 云端对象 key
                                    cloudUrl: uploadResult.url  // 云端 oss:// 引用（同步/换设备用）
                                };
                            } catch (err) {
                                console.warn('[cloud-media] 背景上传失败，仅本地存储', err);
                                showNotification('云端上传失败，暂存本地', 'error', 2500);
                            }
                        }

                        savedBackgrounds.push(stored);
                        saveBackgroundGallery();
                        // 写 localStorage 让 renderBackgroundGallery 里 safeGetItem 能立刻读到激活值
                        if (typeof safeSetItem === 'function') {
                            try { safeSetItem(getStorageKey('chatBackground'), base64); } catch (e) {}
                        }
                        renderBackgroundGallery();
                        applyBackground(base64);
                        localforage.setItem(getStorageKey('chatBackground'), base64);
                        showNotification('新背景已添加并应用', 'success');
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                });
            }

const autoSendToggle = document.getElementById('auto-send-toggle');
const autoSendControl = document.getElementById('auto-send-control');
const autoSendSlider = document.getElementById('auto-send-slider');
const autoSendValue = document.getElementById('auto-send-value');

const updateAutoSendUI = () => {
    autoSendToggle.classList.toggle('active', !!settings.autoSendEnabled);
    autoSendControl.style.display = settings.autoSendEnabled ? "flex" : "none";
    const currentVal = settings.autoSendInterval || 5;
    autoSendSlider.value = currentVal;
    autoSendValue.textContent = `${currentVal}分钟`;
};

updateAutoSendUI();

autoSendToggle.addEventListener('click', () => {
    settings.autoSendEnabled = !settings.autoSendEnabled;
    updateAutoSendUI();
    manageAutoSendTimer(); 
    throttledSaveData();
    showNotification(`主动发送已${settings.autoSendEnabled ? '开启' : '关闭'}`, 'success');
});

autoSendSlider.value = settings.autoSendInterval || 5;
autoSendValue.textContent = `${settings.autoSendInterval || 5}分钟`;

autoSendSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    settings.autoSendInterval = val;
    autoSendValue.textContent = `${val}分钟`;
});

const combineCardsToggle  = document.getElementById('combine-cards-toggle');
const combineCardsControl = document.getElementById('combine-cards-control');
const combineCardsSlider  = document.getElementById('combine-cards-slider');
const combineCardsValue   = document.getElementById('combine-cards-value');

const updateCombineCardsUI = () => {
    const on = !!settings.combineReplyCards;
    combineCardsToggle.classList.toggle('active', on);
    combineCardsSlider.disabled = !on;
    combineCardsControl.style.opacity = on ? '1' : '0.4';
    combineCardsControl.style.pointerEvents = on ? 'auto' : 'none';
    const currentVal = settings.combineReplyMaxCards || 3;
    combineCardsSlider.value = currentVal;
    combineCardsValue.textContent = `${currentVal}句`;
};

updateCombineCardsUI();

combineCardsToggle.addEventListener('click', () => {
    settings.combineReplyCards = !settings.combineReplyCards;
    updateCombineCardsUI();
    // 开关这种一次性点击的操作，不能用"等0.5秒再存"的节流保存——万一点完立刻退出网页，
    // 这0.5秒还没到就直接白点了，等于没保存。改成点了立刻存，不等待
    if (typeof saveData === 'function') {
        try {
            const p = saveData();
            if (p && typeof p.catch === 'function') p.catch(e => console.error('[回复拼接字卡] 保存失败:', e));
        } catch (e) { console.error('[回复拼接字卡] 保存失败:', e); }
    }
    showNotification(`回复拼接字卡已${settings.combineReplyCards ? '开启' : '关闭'}`, 'success');
});

combineCardsSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    settings.combineReplyMaxCards = val;
    combineCardsValue.textContent = `${val}句`;
});
combineCardsSlider.addEventListener('change', throttledSaveData);

autoSendSlider.addEventListener('change', () => {
    manageAutoSendTimer(); 
    throttledSaveData();
});

            const resetBgBtn = document.getElementById('reset-default-bg');
            if (resetBgBtn) {
                resetBgBtn.addEventListener('click', () => {
                    removeBackground();
                    renderBackgroundGallery();
                    showNotification('已移除背景图', 'success');
                });
            }
        }



        function initNewFeatureListeners() {
            const periodEntry = document.getElementById('period-function');
            if (periodEntry) {
                periodEntry.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    showModal(document.getElementById('period-modal'));
                    if (typeof window._pdInit === 'function') window._pdInit();
                });
            }

            // Step 2：入口改成先打开历史列表页，"+"里再选"问梦角"打开创建弹窗
            const surveyEntry = document.getElementById('survey-function');
            if (surveyEntry) {
                surveyEntry.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    if (typeof window._surveyOpenListModal === 'function') window._surveyOpenListModal();
                });
            }

            const flEntry = document.getElementById('fortune-lenormand-function');
            if (flEntry) {
                flEntry.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    generateFortune();
                    switchFLTab('fortune');
                    showModal(document.getElementById('fortune-lenormand-modal'));
                });
            }

            const _closeLenormandEl = document.getElementById('close-lenormand');
            if (_closeLenormandEl) _closeLenormandEl.addEventListener('click', () => {
                hideModal(document.getElementById('fortune-lenormand-modal'));
            });
    const envelopeEntryBtn = document.getElementById('envelope-function');
    async function openEnvelopeModal() {
        hideModal(DOMElements.advancedModal.modal);
        await loadEnvelopeData();
        await checkEnvelopeStatus();
        currentEnvTab = 'outbox';
        document.getElementById('env-tab-outbox').classList.add('active');
        document.getElementById('env-tab-inbox').classList.remove('active');
        document.getElementById('env-outbox-section').style.display = 'block';
        document.getElementById('env-inbox-section').style.display = 'none';
        document.getElementById('env-compose-form').style.display = 'none';
        document.getElementById('env-main-close-btn').style.display = 'flex';
        renderEnvelopeLists();
        showModal(document.getElementById('envelope-modal'));
    }
    if (envelopeEntryBtn) {
        envelopeEntryBtn.addEventListener('click', openEnvelopeModal);
    }
    const envelopeHeaderBtn = document.getElementById('envelope-header-btn');
    if (envelopeHeaderBtn) {
        envelopeHeaderBtn.addEventListener('click', openEnvelopeModal);
    }
    const galleryBanner = document.getElementById('gallery-banner-entry');
    if (galleryBanner) {
        galleryBanner.addEventListener('click', () => {
            window.open('https://aielin17.github.io/-/', '_blank');
        });
        galleryBanner.addEventListener('mousedown', () => { galleryBanner.style.transform = 'scale(0.97)'; });
        galleryBanner.addEventListener('mouseup', () => { galleryBanner.style.transform = 'scale(1)'; });
        galleryBanner.addEventListener('mouseleave', () => { galleryBanner.style.transform = 'scale(1)'; });
    }
const _sendEnvEl = document.getElementById('send-envelope');
if (_sendEnvEl) _sendEnvEl.addEventListener('click', handleSendEnvelope);

const _cancelEnvEl = document.getElementById('cancel-envelope');
if (_cancelEnvEl) _cancelEnvEl.addEventListener('click', () => {
    hideModal(document.getElementById('envelope-modal'));
});
            const closeFortune = document.getElementById('close-fortune');
            if (closeFortune) {
                closeFortune.addEventListener('click', () => {
                    hideModal(document.getElementById('fortune-lenormand-modal'));
                });
            }


            const _batchFavEl = document.getElementById('batch-favorite-function');
            if (_batchFavEl) _batchFavEl.addEventListener('click', () => {
                hideModal(DOMElements.favoritesModal.modal);
                toggleBatchFavoriteMode();
            });

            initReplyLibraryListeners();


            
            DOMElements.anniversaryAnimation.closeBtn.addEventListener('click', () => {
                DOMElements.anniversaryAnimation.modal.classList.remove('active');
            });


            const _statsFuncEl = document.getElementById('stats-function');
            if (_statsFuncEl) _statsFuncEl.addEventListener('click', () => {
                hideModal(DOMElements.advancedModal.modal);
                renderStatsContent();
                showModal(DOMElements.statsModal.modal);
            });

            const coinFunctionBtn = document.getElementById('coin-function');
            if (coinFunctionBtn) {
                coinFunctionBtn.addEventListener('click', () => {
                    hideModal(DOMElements.advancedModal.modal);
                    handleCoinToss();
                });
            }
            // 音乐播放器开关已迁移到新的 mochi 系音乐模块（js/music-player.js）
            // 这里改为打开音乐库页面，不再切换旧的悬浮播放器（该开关项已从高级功能移除，判空防报错）
            const musicToggle = document.getElementById('music-player-toggle');
            if (musicToggle) {
                musicToggle.addEventListener('click', () => {
                    if (window.MilkMusic && typeof window.MilkMusic.open === 'function') {
                        window.MilkMusic.open();
                    } else {
                        showNotification('音乐模块尚未就绪', 'info');
                    }
                    hideModal(DOMElements.advancedModal.modal);
                });
            }
        }
    const annToggleBtn = document.getElementById('ann-toggle-btn');
    const annFormWrapper = document.getElementById('ann-form-wrapper');

    if (annToggleBtn && annFormWrapper) {
        annToggleBtn.addEventListener('click', () => {
            const isActive = annFormWrapper.classList.contains('active');
            
            if (isActive) {
                annFormWrapper.classList.remove('active');
                annToggleBtn.classList.remove('active');
            } else {
                annFormWrapper.classList.add('active');
                annToggleBtn.classList.add('active');
                
                setTimeout(() => {
                    annFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 300);
            }
        });
    }

        function getBubbleStyleName(style) {
            const names = {
                'standard': '标准',
                'rounded': '圆角',
                'rounded-large': '大圆角',
                'square': '方形'
            };
            return names[style] || '标准';
        }


        function initDataManagementListeners() {

            const _clearStorageEl = document.getElementById('clear-storage');
            if (_clearStorageEl) _clearStorageEl.addEventListener('click', clearAllAppData);
            const creditsBtn = document.getElementById('open-credits-btn');
            if (creditsBtn) {
                creditsBtn.addEventListener('click', () => {

                    hideModal(DOMElements.dataModal.modal);


                    const disclaimerModal = document.getElementById('disclaimer-modal');


                    if (disclaimerModal) {
                        showModal(disclaimerModal);
                    }
                });
            }

        }



        DOMElements.sessionModal.managerBtn.addEventListener('click', () => {
            renderSessionList(); showModal(DOMElements.sessionModal.modal);
        });
        DOMElements.sessionModal.createBtn.addEventListener('click', async () => {
            await createNewSession(false);
            renderSessionList();
            showNotification('新会话已创建', 'success');
        });

        DOMElements.sessionModal.list.addEventListener('click', (e) => {
            const item = e.target.closest('.session-item');
            if (!item) return;
            const sessionId = item.dataset.id;

            if (e.target.closest('.rename')) {
                const session = sessionList.find(s => s.id === sessionId);
                const newName = prompt('输入新的会话名称:', session.name);
                if (newName && newName.trim()) {
                    session.name = newName.trim();
                    localforage.setItem(`${APP_PREFIX}sessionList`, sessionList); 
                    renderSessionList();
                    showNotification('会话已重命名', 'success');
                }
            } else if (e.target.closest('.delete')) {
                if (sessionList.length <= 1) {
                    showNotification('无法删除最后一个会话', 'warning');
                    return;
                }
                if (confirm('确定要删除此会话及其所有聊天记录吗？此操作不可恢复')) {

                    const currentSessionId = SESSION_ID;

                    sessionList = sessionList.filter(s => s.id !== sessionId);
localforage.setItem(`${APP_PREFIX}sessionList`, sessionList);

// 同时清除 localStorage 和 localforage 中该会话的所有键
Object.keys(localStorage).forEach(key => {
    if (key.startsWith(`${APP_PREFIX}${sessionId}_`)) safeRemoveItem(key);
});
localforage.keys().then(keys => {
    keys.forEach(key => {
        if (key.startsWith(`${APP_PREFIX}${sessionId}_`)) {
            localforage.removeItem(key).catch(() => {});
        }
    });
}).catch(() => {});

if (sessionId === currentSessionId) {
    const newCurrentId = sessionList[0].id;
    localforage.setItem(`${APP_PREFIX}customThemes`, customThemes);
    window.location.hash = newCurrentId;
    window.location.reload();
} else {
    renderSessionList();
    showNotification('会话已删除', 'success');
}
                }
            } else {

                if (sessionId !== SESSION_ID) {
                    if (confirm('切换会话将刷新页面，确定要继续吗？')) {
                        window.location.hash = sessionId;
                        window.location.reload();
                    }
                }
            }
        });

        function initCoreListeners() {

            DOMElements.chatContainer.addEventListener('scroll', () => {
                const container = DOMElements.chatContainer;
                if (!container) return;
                const hasMoreOlder = msgViewMode === 'window' ? msgWinStart > 0 : (messages.length > displayedMessageCount);
                if (container.scrollTop < 50 && !isLoadingHistory && hasMoreOlder) {
                    if (typeof loadMoreHistory === 'function') loadMoreHistory();
                }
                if (msgViewMode === 'window' && !isLoadingFuture && msgWinEnd < messages.length) {
                    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
                    if (distanceFromBottom < 50) {
                        if (typeof loadMoreFuture === 'function') loadMoreFuture();
                    }
                }
            });

            DOMElements.sendBtn.addEventListener('click', () => isBatchMode ? addToBatch(): sendMessage());
            DOMElements.messageInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); isBatchMode ? addToBatch(): sendMessage();
                }
            });
            DOMElements.messageInput.addEventListener('input', () => {
                DOMElements.messageInput.style.height = 'auto'; DOMElements.messageInput.style.height = `${Math.min(DOMElements.messageInput.scrollHeight, 120)}px`;
            });


            DOMElements.attachmentBtn.addEventListener('click', () => {

                const modal = document.createElement('div');
                modal.className = 'modal image-upload-modal';
                modal.style.cssText = `
            display: flex !important;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 9999;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
            opacity: 0;
            transition: opacity 0.3s ease;
            `;

                modal.innerHTML = `
            <div class="modal-content" style="
            z-index: 10000;
            position: relative;
            background-color: var(--secondary-bg);
            border-radius: var(--radius);
            padding: 24px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            transform: translateY(20px);
            opacity: 0;
            transition: all 0.3s ease;
            ">
            <div class="modal-title"><i class="fas fa-image"></i><span>发送图片</span></div>
            <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <button class="modal-btn modal-btn-secondary upload-mode-btn active" id="upload-image-file-btn" style="flex: 1;">选择文件</button>
            <button class="modal-btn modal-btn-secondary upload-mode-btn" id="paste-image-url-btn" style="flex: 1;">粘贴URL</button>
            </div>
            <input type="file" class="modal-input" id="image-file-input" accept="image/*">
            <input type="text" class="modal-input" id="image-url-input" placeholder="输入图片URL地址" style="display: none;">
            <div id="image-preview" style="text-align: center; margin-top: 10px; display: none;">
            <img id="preview-chat-image" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 2px solid var(--border-color);">
            </div>
            </div>
            <div class="modal-buttons">
            <button class="modal-btn modal-btn-secondary" id="cancel-image">取消</button>
            <button class="modal-btn modal-btn-primary" id="send-image" disabled>发送</button>
            </div>
            </div>
            `;

                document.body.appendChild(modal);


                setTimeout(() => {
                    modal.style.opacity = '1';
                    const content = modal.querySelector('.modal-content');
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0)';
                }, 10);

                const fileInput = document.getElementById('image-file-input');
                const urlInput = document.getElementById('image-url-input');
                const uploadBtn = document.getElementById('upload-image-file-btn');
                const pasteUrlBtn = document.getElementById('paste-image-url-btn');
                const previewDiv = document.getElementById('image-preview');
                const previewImg = document.getElementById('preview-chat-image');
                const sendBtn = document.getElementById('send-image');
                const cancelBtn = document.getElementById('cancel-image');
                const uploadModeBtns = document.querySelectorAll('.upload-mode-btn');

                let currentImageData = null;


                function switchUploadMode(isFileMode) {
                    uploadModeBtns.forEach(btn => btn.classList.remove('active'));
                    if (isFileMode) {
                        uploadBtn.classList.add('active');
                        fileInput.style.display = 'block';
                        urlInput.style.display = 'none';
                    } else {
                        pasteUrlBtn.classList.add('active');
                        fileInput.style.display = 'none';
                        urlInput.style.display = 'block';
                        urlInput.focus();
                    }

                    previewDiv.style.display = 'none';
                    sendBtn.disabled = true;
                    currentImageData = null;
                }


                uploadBtn.addEventListener('click', () => switchUploadMode(true));


                pasteUrlBtn.addEventListener('click', () => switchUploadMode(false));


                fileInput.addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        if (file.size > MAX_IMAGE_SIZE) {
                            showNotification('图片大小不能超过5MB', 'error');
                            return;
                        }
                        showNotification('正在优化图片...', 'info', 1500);
                        optimizeImage(file).then(optimizedData => {
                            currentImageData = optimizedData;
                            previewImg.src = currentImageData;
                            previewDiv.style.display = 'block';
                            sendBtn.disabled = false;
                        }).catch(() => {
                            showNotification('图片处理失败', 'error');
                        });
                    }
                });


                urlInput.addEventListener('input',
                    function() {
                        const url = urlInput.value.trim();
                        if (url) {

                            if (/^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|bmp))$/i.test(url)) {
                                previewImg.src = url;
                                previewDiv.style.display = 'block';
                                currentImageData = url;
                                sendBtn.disabled = false;


                                const img = new Image();
                                img.onload = function() {

                                    previewImg.src = url;
                                    showNotification('图片URL有效', 'success', 1000);
                                };
                                img.onerror = function() {
                                    showNotification('图片URL无效或无法访问', 'error');
                                    sendBtn.disabled = true;
                                    previewDiv.style.display = 'none';
                                };
                                img.src = url;
                            } else {
                                sendBtn.disabled = true;
                                previewDiv.style.display = 'none';
                            }
                        } else {
                            sendBtn.disabled = true;
                            previewDiv.style.display = 'none';
                        }
                    });


                sendBtn.addEventListener('click',
                    () => {
                        if (currentImageData) {
                            const messageId = Date.now();
                            let imageField = currentImageData;
                            let uploadStatus = null;

                            // 阶段三B：如果是 base64 且连了云端，走上传队列（无感知重试）
                            const isBase64Img = typeof currentImageData === 'string' && currentImageData.indexOf('data:image') === 0;
                            const cloudReady = !!(window.CloudMedia && window.CloudSync && window.CloudSync.isConnected());
                            if (isBase64Img && cloudReady) {
                                const taskId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                                imageField = 'pending://' + taskId;
                                uploadStatus = 'uploading';
                                // 同步入队：内部同步写内存缓存 + 队列，随后消息渲染能立刻读到 base64
                                window.CloudMedia.queueUpload(currentImageData, 'chat-images', {
                                    taskId: taskId,
                                    messageId: messageId,
                                    onSuccess: async (result) => {
                                        const target = messages.find(m => String(m.id) === String(messageId));
                                        if (!target) return;
                                        target.image = result.url;
                                        delete target.uploadStatus;
                                        try { throttledSaveData(); } catch (e) {}
                                        // 先拉 blob URL，拿到后再替换 DOM，避免 img.src='' 的白屏闪烁
                                        try {
                                            const wrapper = document.querySelector('.message-wrapper[data-id="' + messageId + '"]');
                                            if (!wrapper) return;
                                            const wrap = wrapper.querySelector('.message-image-pending-wrap');
                                            if (!wrap) return;
                                            const img = wrap.querySelector('img');
                                            const parent = wrap.parentNode;
                                            if (!img || !parent) return;
                                            // 先拉全尺寸 blob
                                            let blobUrl = null;
                                            try {
                                                blobUrl = window.CloudMedia ? await window.CloudMedia.fetchUrl(result.url) : null;
                                            } catch (fetchErr) {
                                                console.warn('[cloud-media] 上传完拉图失败，继续显示本地图', fetchErr);
                                            }
                                            // 有 blob 就直接设 src；没有就走懒加载（下次滚动到触发）
                                            img.removeAttribute('data-pending-ref');
                                            img.setAttribute('onclick', "viewImage('" + result.url + "')");
                                            if (blobUrl) {
                                                img.src = blobUrl;
                                            } else {
                                                img.src = '';
                                                img.setAttribute('data-lazy-cloud-ref', result.url);
                                                if (window.CloudMedia) window.CloudMedia.bindLazyImage(img, result.url);
                                            }
                                            parent.replaceChild(img, wrap);
                                        } catch (e) { console.warn('[cloud-media] 局部更新失败', e); }
                                    }
                                });
                            }

                            addMessage({
                                id: messageId,
                                sender: 'user',
                                text: '',
                                timestamp: new Date(),
                                image: imageField,
                                status: 'sent',
                                favorited: false,
                                note: null,
                                replyTo: currentReplyTo,
                                type: 'normal',
                                uploadStatus: uploadStatus
                            });
                            playSound('send');
                            currentReplyTo = null;
                            updateReplyPreview();
                            const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                            const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
                            setTimeout(simulateReply, randomDelay);


                            closeModal();
                        }
                    });


                cancelBtn.addEventListener('click',
                    closeModal);


                function closeModal() {
                    modal.style.opacity = '0';
                    const content = modal.querySelector('.modal-content');
                    content.style.opacity = '0';
                    content.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        if (modal.parentNode) {
                            modal.parentNode.removeChild(modal);
                        }
                    },
                        300);
                }


                modal.addEventListener('click',
                    (e) => {
                        if (e.target === modal) {
                            closeModal();
                        }
                    });


                modal.querySelector('.modal-content').addEventListener('click',
                    (e) => {
                        e.stopPropagation();
                    });


                const handleEscKey = (e) => {
                    if (e.key === 'Escape') {
                        closeModal();
                        document.removeEventListener('keydown', handleEscKey);
                    }
                };
                document.addEventListener('keydown', handleEscKey);


                modal.addEventListener('close', () => {
                    document.removeEventListener('keydown', handleEscKey);
                });
            });


            DOMElements.imageInput.addEventListener('change', () => {
                if (DOMElements.imageInput.files[0]) {
                    if (isBatchMode) {
                        showNotification('批量模式不支持图片', 'warning');
                        DOMElements.imageInput.value = '';
                    } else {
                        sendMessage();
                    }
                }
            });

            DOMElements.continueBtn.addEventListener('click', simulateReply);
            DOMElements.batchBtn.addEventListener('click', toggleBatchMode);
        }



function _applyCollapseState(on) {
    document.body.classList.toggle('bottom-collapse-mode', on);
    const csToggle = document.getElementById('bottom-collapse-cs-toggle');
    if (csToggle) csToggle.classList.toggle('active', on);
    if (!on) {
        const panel = document.getElementById('collapsed-extras-panel');
        if (panel) panel.style.display = 'none';
        const expandBtn = document.getElementById('collapse-expand-btn');
        if (expandBtn) expandBtn.classList.remove('open');
    }
}

window._toggleBottomCollapse = function() {
    const isOn = !document.body.classList.contains('bottom-collapse-mode');
    if (typeof settings !== 'undefined') settings.bottomCollapseMode = isOn;
    _applyCollapseState(isOn);
    if (typeof throttledSaveData === 'function') throttledSaveData();
    if (typeof showNotification === 'function')
        showNotification(isOn ? '底部栏已收纳 — 点击 ⌃ 展开更多' : '已退出收纳模式', 'success', 2000);
};

window.toggleCollapsedExtras = function() {
    const panel = document.getElementById('collapsed-extras-panel');
    const btn = document.getElementById('collapse-expand-btn');
    if (!panel) return;
    const willOpen = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = willOpen ? 'block' : 'none';
    if (btn) btn.classList.toggle('open', willOpen);

    function wireExtra(extraId, primaryId) {
        const extra = document.getElementById(extraId);
        const primary = document.getElementById(primaryId);
        if (extra && primary && !extra._linked) {
            extra._linked = true;
            extra.addEventListener('click', (e) => { e.stopPropagation(); primary.click(); });
        }
    }
    wireExtra('combo-btn-extra', 'combo-btn');
    wireExtra('batch-btn-extra', 'batch-btn');
};

window.exitCollapseMode = function() {
    if (typeof settings !== 'undefined') settings.bottomCollapseMode = false;
    _applyCollapseState(false);
    if (typeof throttledSaveData === 'function') throttledSaveData();
    if (typeof showNotification === 'function') showNotification('已退出收纳模式', 'success', 2000);
};

(function initCollapseMode() {
    function tryApply() {
        if (typeof settings !== 'undefined') {
            if (settings.bottomCollapseMode) _applyCollapseState(true);
        } else {
            setTimeout(tryApply, 300);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryApply);
    } else {
        setTimeout(tryApply, 400);
    }
})();
