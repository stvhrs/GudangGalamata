import React, { useState, useMemo } from 'react';
import { Card, Table, Input, Row, Col, Typography, DatePicker, Statistic, Button, Space, Spin, Popconfirm, message, Modal, Form, Tag } from 'antd';
import { ReloadOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// --- CUSTOM HOOKS ---
import { useHistoriStockRestockStream } from '../../../hooks/useFirebaseData'; 
import useDebounce from '../../../hooks/useDebounce'; 
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';

// --- IMPORT FIREBASE ---
import { getDatabase, ref, update, runTransaction, remove } from 'firebase/database';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ============================================================================
// --- SERVICE LOGIC ---
// ============================================================================

const serviceDeleteTransaction = async (record) => {
    const db = getDatabase();
    // Update key: menyesuaikan dengan kolom baru (bukuId)
    const bookKey = record.bukuId; 
    
    if (!bookKey) throw new Error("Kode Buku tidak ditemukan.");

    console.log(`[DELETE] History: ${record.id} | Revert Stok Buku: ${bookKey}`);

    const historyRef = ref(db, `stock_history/${record.id}`);
    const bookStockRef = ref(db, `products/${bookKey}/stok`);

    // Kembalikan stok (Revert): Stok Sekarang - Jumlah History
    await runTransaction(bookStockRef, (currentStock) => {
        const current = Number(currentStock) || 0;
        const revertAmount = Number(record.perubahan);
        return current - revertAmount;
    });

    // Hapus data history
    await remove(historyRef);
    return true;
};

const serviceUpdateTransaction = async (idHistory, kodeBuku, oldQty, newQty, stokSebelum, newKeterangan) => {
    const db = getDatabase();
    
    if (!kodeBuku) throw new Error("Kode Buku tidak valid.");

    // 1. Hitung Selisih Real (Berapa yang harus ditambah/dikurang ke buku)
    const selisih = Number(newQty) - Number(oldQty);

    // 2. Hitung Ulang Stok Sesudah di History
    const newStokSesudah = Number(stokSebelum || 0) + Number(newQty);

    console.log(`[EDIT] Delta Real: ${selisih} | History StokSesudah: ${newStokSesudah}`);

    const updates = {};
    updates[`stock_history/${idHistory}/perubahan`] = Number(newQty);
    // Update key: stokSesudah -> stokAkhir (sesuai JSON baru) jika perlu, 
    // tapi karena firebase biasanya pake field lama, pastikan struktur DB konsisten.
    // Di sini saya asumsikan update field standard:
    updates[`stock_history/${idHistory}/stokAkhir`] = Number(newStokSesudah); 
    updates[`stock_history/${idHistory}/keterangan`] = newKeterangan;

    // Update Stok Real Buku
    const bookStockRef = ref(db, `buku/${kodeBuku}/stok`);
    await runTransaction(bookStockRef, (currentStock) => {
        const current = Number(currentStock) || 0;
        return current + selisih;
    });

    // Update History
    await update(ref(db), updates);

    return true;
};

// ============================================================================
// --- MAIN COMPONENT ---
// ============================================================================

const StokHistoryTabRestock = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState([
        dayjs().subtract(1, 'month').startOf('month'), 
        dayjs().endOf('month')
    ]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [loadingAction, setLoadingAction] = useState(false);
    const [form] = Form.useForm();

    // --- DATA STREAM ---
    const streamParams = useMemo(() => ({
        startDate: dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : null,
        endDate: dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : null
    }), [dateRange]);

    const { historyList, loadingHistory } = useHistoriStockRestockStream(streamParams);
    
    // --- FILTER ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);

    const filteredHistory = useMemo(() => {
        if (!historyList) return [];
        let data = [...historyList];

        // 1. FILTER RESTOCK: Hanya ambil yang depannya "Restock"
        data = data.filter(item => {
            const ket = item.keterangan || '';
            return ket.startsWith('Restock');
        });

        // 2. FILTER SEARCH (Update key: bukuId)
        if (debouncedSearchText) {
            const lowerSearch = debouncedSearchText.toLowerCase();
            data = data.filter(item =>
                (item.judul || '').toLowerCase().includes(lowerSearch) ||
                (item.bukuId || '').toLowerCase().includes(lowerSearch) ||
                (item.refId || '').toLowerCase().includes(lowerSearch) ||
                (item.nama || '').toLowerCase().includes(lowerSearch)
            );
        }
        return data;
    }, [historyList, debouncedSearchText]);

    // --- HANDLERS ---
    const handleRefresh = () => {
        const current = [...dateRange];
        setDateRange([]); 
        setTimeout(() => setDateRange(current), 100);
    };

    const handleDelete = async (record) => {
        setLoadingAction(true);
        try {
            await serviceDeleteTransaction(record);
            message.success("Data dihapus & stok dikembalikan.");
        } catch (error) {
            console.error(error);
            message.error(`Gagal delete: ${error.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    const handleEditClick = (record) => {
        setEditingItem(record);
        form.setFieldsValue({
            judul: record.judul,
            perubahan: record.perubahan, 
            keterangan: record.keterangan 
        });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        try {
            const values = await form.validateFields();
            setLoadingAction(true);

            const oldQty = Number(editingItem.perubahan);
            const newQty = Number(values.perubahan);
            // Update key: stokAwal
            const stokSebelum = Number(editingItem.stokAwal) || 0; 
            // Update key: bukuId
            const kodeBuku = editingItem.bukuId; 

            // --- LOGIKA IDENTIFIER ---
            let userText = values.keterangan;
            if (!userText.toLowerCase().startsWith('restock')) {
                userText = `Restock ${userText}`; 
            }

            await serviceUpdateTransaction(
                editingItem.id,
                kodeBuku, 
                oldQty,
                newQty,
                stokSebelum, 
                userText
            );

            message.success("Update Berhasil!");
            setIsEditModalOpen(false);
            
        } catch (error) {
            console.error(error);
            message.error(`Gagal update: ${error.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    // --- COLUMNS (SESUAI REQUEST) ---
    const columns = [
        {
            title: 'Waktu', 
            dataIndex: 'tanggal', 
            key: 'tanggal',
            render: (val) => timestampFormatter(val),
            width: 140,
            fixed: 'left',
            sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0),
            defaultSortOrder: 'descend',
        },
        { 
            title: 'Ref ID', 
            dataIndex: 'refId', 
            key: 'refId', 
            width: 140,
            render: (text) => text ? <Tag color="geekblue" style={{ marginRight: 0 }}>{text}</Tag> : '-'
        },
        { 
            title: 'Kode Buku', 
            dataIndex: 'bukuId', 
            key: 'bukuId', 
            width: 100,
            render: (text) => <Text code>{text}</Text>
        },
        { 
            title: 'Judul Buku', 
            dataIndex: 'judul', 
            key: 'judul', 
            width: 250, 
        },
        {
            title: 'Oleh', 
            dataIndex: 'nama',
            key: 'nama',
            width: 110,
            render: (text) => (
                <Space size={4}>
                    <UserOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                    <Text className="text-xs">{text || '-'}</Text>
                </Space>
            )
        },
        { 
            title: 'Awal', 
            dataIndex: 'stokAwal', 
            key: 'stokAwal', 
            align: 'right', 
            width: 80, 
            render: numberFormatter 
        },
        {
            title: 'Perubahan', 
            dataIndex: 'perubahan', 
            key: 'perubahan',
            align: 'right', 
            width: 100,
            render: (val) => {
                const num = Number(val); 
                const color = num > 0 ? '#52c41a' : (num < 0 ? '#f5222d' : '#8c8c8c');
                const prefix = num > 0 ? '+' : '';
                return (
                    <Text strong style={{ color: color }}>
                        {prefix}{numberFormatter(val)} 
                    </Text>
                )
            },
            sorter: (a, b) => (a.perubahan || 0) - (b.perubahan || 0),
        },
        { 
            title: 'Akhir', 
            dataIndex: 'stokAkhir', 
            key: 'stokAkhir', 
            align: 'right', 
            width: 80, 
            render: numberFormatter 
        },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            key: 'keterangan', 
            width: 200,
            render: (text) => <span style={{ color: '#595959' }}>{text}</span>
        },
        // {
        //     title: 'Aksi', 
        //     key: 'aksi', 
        //     width: 100, 
        //     fixed: 'right', 
        //     align: 'center',
        //     render: (_, record) => (
        //         <Space>
        //             <Button 
        //                 icon={<EditOutlined />} 
        //                 size="small" 
        //                 onClick={() => handleEditClick(record)} 
        //             />
        //             <Popconfirm
        //                 title="Hapus Data?"
        //                 description={`Stok buku akan dikurangi ${record.perubahan} pcs.`}
        //                 onConfirm={() => handleDelete(record)}
        //                 okText="Hapus"
        //                 cancelText="Batal"
        //                 okButtonProps={{ loading: loadingAction, danger: true }}
        //             >
        //                 <Button 
        //                     icon={<DeleteOutlined />} 
        //                     size="small" 
        //                     danger 
        //                     loading={loadingAction}
        //                 />
        //             </Popconfirm>
        //         </Space>
        //     )
        // }
    ];

    // --- RENDER ---
    return (
        <Spin spinning={loadingHistory} tip="Sync Data...">
            <Card style={{ marginBottom: 16 }}>
                 <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                    <Col>
                         <Title level={4} style={{ margin: 0 }}>Restock History</Title>
                    </Col>
                    <Col>
                         <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Sync</Button>
                    </Col>
                </Row>
                
                <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Statistic 
                        title="Total Barang Masuk"
                        value={filteredHistory.reduce((acc, curr) => acc + (Number(curr.perubahan) || 0), 0)}
                        prefix="+"
                        valueStyle={{ color: '#3f8600' }}
                        formatter={numberFormatter}
                    />
                </Card>
            </Card>

            <Card>
                <Row justify="end" style={{ marginBottom: 16 }} gutter={[8,8]}>
                    <Col>
                        <RangePicker 
                            value={dateRange}
                            onChange={(dates) => setDateRange(dates)}
                            allowClear={false}
                            format="DD MMM YYYY"
                        />
                    </Col>
                    <Col>
                         <Input.Search
                            placeholder="Cari..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                            style={{ width: 200 }}
                        />
                    </Col>
                </Row>

                <Table
                    columns={columns}
                    dataSource={filteredHistory}
                    loading={loadingHistory}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1300, y: 500 }}
                    pagination={{ defaultPageSize: 20 }}
                />
            </Card>

            <Modal
style={{ top: 20 }}
                title={<span><EditOutlined /> Edit Restock</span>}
                open={isEditModalOpen}
                onOk={handleSaveEdit}
                onCancel={() => setIsEditModalOpen(false)}
                confirmLoading={loadingAction}
                okText="Simpan"
                okButtonProps={{ danger: true }}
            >
                <div style={{ marginBottom: 16, padding: 10, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                    <Text type="danger">
                        <ExclamationCircleOutlined /> <b>Perhatian:</b> 
                        <br/>1. Stok Real Buku akan diupdate otomatis.
                        <br/>2. Kata "Restock" wajib ada di depan (sistem akan menambahkannya jika Anda hapus).
                    </Text>
                </div>

                <Form form={form} layout="vertical">
                    <Form.Item label="Judul Buku">
                        <Input disabled value={editingItem?.judul} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                             <Form.Item label="Qty Lama"><Input disabled value={editingItem?.perubahan} /></Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="perubahan" label="Qty Baru" rules={[{ required: true }]}>
                                <Input type="number" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item 
                        name="keterangan" 
                        label="Keterangan" 
                        rules={[{ required: true }]} 
                    >
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </Spin>
    );
};

export default StokHistoryTabRestock;