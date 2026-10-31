(function () {
    'use strict';

    /**
     * Плагин автоматической синхронизации просмотров TorrServe -> Lampa
     * Срабатывает при запуске Lampa и при возврате на главный экран.
     */
    function TorrServeGlobalSyncPlugin() {
        // Показ уведомлений на экране ТВ для отладки
        function showNotice(text) {
            try {
                if (window.Lampa && Lampa.Noty) {
                    Lampa.Noty.show(text);
                }
            } catch (e) {}
            console.log('[TorrServeSync]', text);
        }

        // Формирование URL TorrServe
        function getTorrServeUrl() {
            var ip = Lampa.Storage.field('torrserve_url') || Lampa.Storage.field('torrserve_url_native') || '127.0.0.1:8090';
            if (!/^https?:\/\//i.test(ip)) {
                ip = 'http://' + ip;
            }
            return ip.replace(/\/$/, '');
        }

        // Заголовки авторизации
        function getAuthHeader() {
            if (Lampa.Storage.field('torrserve_auth')) {
                var login = Lampa.Storage.field('torrserve_login') || '';
                var pass = Lampa.Storage.field('torrserve_password') || '';
                return { 'Authorization': 'Basic ' + btoa(login + ':' + pass) };
            }
            return {};
        }

        function syncAllTorrents() {
            var serverUrl = getTorrServeUrl();

            // Запрашиваем просмотренные из TorrServe
            $.ajax({
                url: serverUrl + '/viewed',
                type: 'POST',
                data: JSON.stringify({ action: 'list' }),
                contentType: 'application/json',
                headers: getAuthHeader(),
                timeout: 4000,
                success: function (viewedItems) {
                    if (!Array.isArray(viewedItems) || !viewedItems.length) {
                        return;
                    }

                    // Запрашиваем список торрентов из TorrServe
                    $.ajax({
                        url: serverUrl + '/torrents',
                        type: 'POST',
                        data: JSON.stringify({ action: 'list' }),
                        contentType: 'application/json',
                        headers: getAuthHeader(),
                        timeout: 4000,
                        success: function (torrentsList) {
                            if (!Array.isArray(torrentsList) || !torrentsList.length) return;

                            var onlineView = Lampa.Storage.get('online_view', {}) || {};
                            var favoriteHistory = Lampa.Storage.get('favorite', {}) || {};
                            var historyList = Lampa.Storage.get('history', []) || [];
                            var hasChanges = false;

                            // Создаем словарь хэшей
                            var torrentMap = {};
                            torrentsList.forEach(function (t) {
                                if (t.hash) torrentMap[t.hash.toLowerCase()] = t;
                            });

                            var syncedCount = 0;

                            viewedItems.forEach(function (item) {
                                if (!item.hash) return;
                                var hashLower = item.hash.toLowerCase();
                                var torrentInfo = torrentMap[hashLower];

                                if (torrentInfo) {
                                    syncedCount++;
                                    var fileIndex = item.file_index !== undefined ? item.file_index : 0;
                                    var torrentTitle = torrentInfo.title || 'TorrServe Media';

                                    // 1. Сохраняем в метки времени Lampa
                                    var timeKey = hashLower + '_' + fileIndex;
                                    if (!onlineView[timeKey]) {
                                        onlineView[timeKey] = {
                                            time: 100,
                                            duration: 100,
                                            percent: 100,
                                            updated: Date.now()
                                        };
                                        hasChanges = true;
                                    }

                                    // 2. Ищем похожую карточку в истории и отмечаем ее
                                    var inHistory = historyList.some(function(h) {
                                        return h.hash === hashLower || (h.title && torrentTitle.indexOf(h.title) !== -1);
                                    });

                                    if (!inHistory) {
                                        historyList.unshift({
                                            id: hashLower,
                                            hash: hashLower,
                                            title: torrentTitle,
                                            time: Date.now()
                                        });
                                        hasChanges = true;
                                    }
                                }
                            });

                            if (hasChanges) {
                                Lampa.Storage.set('online_view', onlineView);
                                Lampa.Storage.set('history', historyList);
                                showNotice('TorrServe: Синхронизировано ' + syncedCount + ' просмотров');
                            }
                        }
                    });
                },
                error: function (err) {
                    console.log('[TorrServeSync] Ошибка подключения к TorrServe:', serverUrl);
                }
            });
        }

        // Старт синхронизации
        setTimeout(syncAllTorrents, 1000);

        // При возврате на главный экран
        Lampa.Listener.follow('main', function (e) {
            if (e.type === 'render') {
                syncAllTorrents();
            }
        });
    }

    if (window.appready) {
        TorrServeGlobalSyncPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') TorrServeGlobalSyncPlugin();
        });
    }
})();
