import React, { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Select, Input, InputNumber, Button, message, Spin, Row, Col } from 'antd';
import { SaveOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ref, get, update, remove, query, orderByKey, startAt, endAt } from 'firebase/database'; // Hapus 'set', pakai 'update' root

import { db } from '../../../api/firebase'; 
import { usePelangganStream } from '../../../hooks/useFirebaseData'; 

const { TextArea } = Input;
const { Option } = Select;

const NonFakturForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [isGeneratingId, setIsGeneratingId] = useState(false);
    
    // Modal Context
    const [modal, contextHolder] = Modal.useModal();

    // Data Customer
    const { pelangganList = [], loadingPelanggan } = usePelangganStream();
    
    const isEditMode = !!initialValues;

    // 🔥 1. Watch Tanggal agar ID berubah real-time saat tanggal diganti
    const selectedDate = Form.useWatch('tanggal', form);

    // --- INIT FORM ---
    useEffect(() => {
        if (open) {
            if (initialValues) {
                // EDIT MODE
                form.setFieldsValue({
                    id: initialValues.id,
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    customerId: initialValues.customerId,
                    totalBayar: initialValues.totalBayar,
                    keterangan: initialValues.keterangan,
                });
            } else {
                // CREATE MODE
                form.resetFields();
                form.setFieldsValue({ 
                    tanggal: dayjs(), 
                    keterangan: 'NITIP' 
                });
            }
        }
    }, [open, initialValues, form]);

    // --- AUTO GENERATE ID (NF-YYMMDD-XXX) ---
    useEffect(() => {
        if (isEditMode || !open) return;

        let isMounted = true;
        setIsGeneratingId(true);

        const generateId = async () => {
            try {
                const dateBasis = selectedDate ? dayjs(selectedDate) : dayjs();
                const dateFormat = dateBasis.format('YYMMDD');
                const keyPrefix = `NF-${dateFormat}-`;

                const q = query(
                    ref(db, 'non_faktur'),
                    orderByKey(),
                    startAt(keyPrefix),
                    endAt(keyPrefix + '\uf8ff')
                );

                const snapshot = await get(q);
                let nextNum = 1;

                if (snapshot.exists()) {
                    const keys = Object.keys(snapshot.val()).sort();
                    const lastKey = keys[keys.length - 1];
                    
                    const parts = lastKey.split('-');
                    const lastSeq = parts[parts.length - 1];
                    const num = parseInt(lastSeq, 10);
                    
                    if (!isNaN(num)) nextNum = num + 1;
                }

                if (isMounted) {
                    const newId = `${keyPrefix}${String(nextNum).padStart(3, '0')}`;
                    form.setFieldsValue({ id: newId });
                }
            } catch (error) {
                console.error("Error generate ID:", error);
            } finally {
                if (isMounted) setIsGeneratingId(false);
            }
        };

        generateId();

        return () => { isMounted = false; };
    }, [isEditMode, open, selectedDate, form]);

    // --- DELETE HANDLER ---
    const handleDelete = () => {
        const targetId = initialValues?.id;
        if (!targetId) return message.error("ID tidak ditemukan.");

        modal.confirm({
            title: 'Hapus Data Non-Faktur?',
            icon: <ExclamationCircleOutlined />,
            content: `Yakin ingin menghapus data ${targetId}?`,
            okText: 'Ya, Hapus',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                try {
                    await remove(ref(db, `non_faktur/${targetId}`));
                    message.success('Data berhasil dihapus');
                    onCancel();
                } catch (error) {
                    console.error("Gagal Hapus:", error);
                    message.error(`Gagal menghapus: ${error.message}`);
                }
            }
        });
    };

    // --- SUBMIT HANDLER ---
    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const { id, tanggal, customerId, totalBayar, keterangan } = values;

            // Cari Nama Customer
            const selectedCustomer = pelangganList.find(p => p.id === customerId);
            const namaCust = selectedCustomer ? selectedCustomer.nama : 'Umum';
            const timestampNow = Date.now();

            const dataPayload = {
                id, 
                arah: "IN", 
                sumber: "NON_FAKTUR", 
                tanggal: tanggal.valueOf(), 
                customerId,
                namaCustomer: namaCust,
                totalBayar,
                keterangan: keterangan || '-',
                updatedAt: timestampNow
            };

            // Multi-path updates object
            const updates = {};

            if (isEditMode) {
                // UPDATE Existing
                updates[`non_faktur/${id}`] = {
                    ...initialValues,
                    ...dataPayload
                };
            } else {
                // CREATE New
                updates[`non_faktur/${id}`] = {
                    ...dataPayload,
                    createdAt: timestampNow,
                };
            }

            // 🔥 UPDATE CUSTOMER TIMESTAMP
            if (customerId) {
                updates[`customers/${customerId}/updatedAt`] = timestampNow;
            }

            // Eksekusi Atomic Update
            await update(ref(db), updates);
            
            message.success(isEditMode ? 'Data diperbarui' : `Tersimpan: ${id}`);
            onCancel();
        } catch (error) {
            console.error("Error Saving:", error);
            message.error('Gagal menyimpan data');
        } finally {
            setLoading(false);
        }
    };

    // --- FOOTER ---
    const renderFooter = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
                {isEditMode && (
                    <Button danger onClick={handleDelete} icon={<DeleteOutlined />}>
                        Hapus
                    </Button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={onCancel} disabled={loading}>Batal</Button>
                <Button type="primary" onClick={() => form.submit()} loading={loading || isGeneratingId} icon={<SaveOutlined />}>
                    {isEditMode ? 'Simpan Perubahan' : 'Simpan Data'}
                </Button>
            </div>
        </div>
    );

    return (
        <>
            {contextHolder}
            <Modal
                style={{ top: 20 }}
                title={isEditMode ? `Edit Non-Faktur` : "Input Non-Faktur Baru"}
                open={open}
                onCancel={onCancel}
                footer={renderFooter()} 
                destroyOnClose
                maskClosable={false}
                centered
            >
                <Spin spinning={loading || isGeneratingId}>
                    <Form form={form} layout="vertical" onFinish={handleFinish}>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="id" label="No. Transaksi">
                                    <Input disabled style={{fontWeight: 'bold'}} placeholder="Auto..." />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item label="Tanggal" name="tanggal" rules={[{ required: true }]}>
                                    <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} allowClear={false} />
                                </Form.Item>
                            </Col>
                        </Row>
                        
                        <Form.Item 
                            label="Nama Customer" 
                            name="customerId" 
                            rules={[{ required: true, message: 'Harap pilih pelanggan' }]}
                        >
                            <Select 
                                showSearch 
                                placeholder="Pilih Customer" 
                                optionFilterProp="children" 
                                loading={loadingPelanggan}
                                filterOption={(input, option) =>
                                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                            >
                                {pelangganList.map(p => (
                                    <Option key={p.id} value={p.id}>
                                        {p.nama}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        
                        <Form.Item 
                            label="Nominal (Rp)" 
                            name="totalBayar" 
                            rules={[{ required: true, message: 'Harap isi nominal' }]}
                        >
                            <InputNumber 
                                style={{ width: '100%' }} 
                                formatter={v => `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                                parser={v => v.replace(/\Rp\s?|(,*)/g, '')} 
                                min={0} 
                            />
                        </Form.Item>
                        
                        <Form.Item label="Keterangan" name="keterangan">
                            <TextArea rows={3} placeholder="Contoh: NITIP" />
                        </Form.Item>
                    </Form>
                </Spin>
            </Modal>
        </>
    );
};

export default NonFakturForm;