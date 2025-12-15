import React, { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Select, Input, InputNumber, Button, message } from 'antd';
import { SaveOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ref, get, set, update, remove, query, orderByKey, startAt, endAt, limitToLast } from 'firebase/database';

import { db } from '../../../api/firebase'; 
import { usePelangganStream } from '../../../hooks/useFirebaseData'; 

const { TextArea } = Input;
const { Option } = Select;

const NonFakturForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // 1. INI SOLUSINYA: Gunakan useModal Hook dari AntD V5+
    const [modal, contextHolder] = Modal.useModal();

    const { pelangganList, loadingPelanggan } = usePelangganStream();
    const isEditMode = !!initialValues;

    // --- ISI FORM ---
    useEffect(() => {
        if (open) {
            if (initialValues) {
                form.setFieldsValue({
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    namaPelanggan: initialValues.namaPelanggan,
                    jumlah: initialValues.jumlah,
                    keterangan: initialValues.keterangan,
                });
            } else {
                form.resetFields();
                form.setFieldsValue({ tanggal: dayjs(), keterangan: 'NITIP' });
            }
        }
    }, [open, initialValues, form]);

    // --- GENERATE ID ---
    const generateNewId = async (selectedDate) => {
        const year = selectedDate.format('YYYY');
        const month = selectedDate.format('MM');
        const prefixKey = `VF-${year}-${month}-`;
        const prefixDisplay = `VF/${year}/${month}/`;

        const q = query(ref(db, 'nonFaktur'), orderByKey(), startAt(prefixKey), endAt(prefixKey + '\uf8ff'), limitToLast(1));
        const snapshot = await get(q);
        
        let nextSequence = '0001';
        if (snapshot.exists()) {
            const lastKey = Object.keys(snapshot.val())[0]; 
            const lastSeq = parseInt(lastKey.split('-').pop(), 10);
            if (!isNaN(lastSeq)) nextSequence = (lastSeq + 1).toString().padStart(4, '0');
        }
        return { keyId: `${prefixKey}${nextSequence}`, displayId: `${prefixDisplay}${nextSequence}` };
    };

    // --- FUNGSI DELETE (DIPERBAIKI) ---
    const handleDelete = () => {
        console.log("1. Tombol Delete Ditekan"); 
        
        const targetId = initialValues?.id;

        if (!targetId) {
            console.error("ID Kosong/Undefined pada initialValues", initialValues);
            return message.error("Error: ID data tidak ditemukan.");
        }

        console.log("2. Target ID untuk dihapus:", targetId);

        // Gunakan instance 'modal' dari hook, bukan Modal statis
        modal.confirm({
            title: 'Hapus Data?',
            icon: <ExclamationCircleOutlined />,
            content: `Yakin ingin menghapus data ${initialValues.nomorInvoice || targetId}?`,
            okText: 'Ya, Hapus',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                console.log("3. Konfirmasi OK ditekan. Memulai proses delete firebase...");
                try {
                    const dbRef = ref(db, `nonFaktur/${targetId}`);
                    await remove(dbRef);
                    
                    console.log("4. Berhasil delete di Firebase");
                    message.success('Data berhasil dihapus');
                    onCancel(); // Tutup Form Modal Utama
                } catch (error) {
                    console.error("GAGAL HAPUS FIREBASE:", error);
                    message.error(`Gagal menghapus: ${error.message}`);
                }
            }
        });
    };

    // --- SUBMIT FORM ---
    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const tgl = values.tanggal;
            const common = {
                tanggal: tgl.valueOf(),
                namaPelanggan: values.namaPelanggan,
                jumlah: values.jumlah,
                keterangan: values.keterangan,
                index_kategori_tanggal: `Non Faktur_${tgl.valueOf()}`
            };

            if (isEditMode) {
                await update(ref(db, `nonFaktur/${initialValues.id}`), { ...initialValues, ...common });
                message.success('Data diperbarui');
            } else {
                const { keyId, displayId } = await generateNewId(tgl);
                await set(ref(db, `nonFaktur/${keyId}`), {
                    id: keyId, idTransaksi: keyId, noInvoice: displayId, nomorInvoice: displayId,
                    ...common,
                    namaPelanggan: values.namaPelanggan || 'Umum',
                    keterangan: values.keterangan || '-',
                    kategori: 'Non Faktur', tipe: 'pemasukan',
                    detailAlokasi: { [keyId]: { amount: values.jumlah, noInvoice: displayId } }
                });
                message.success(`Tersimpan: ${displayId}`);
            }
            onCancel();
        } catch (error) {
            console.error(error);
            message.error('Gagal menyimpan');
        } finally {
            setLoading(false);
        }
    };

    // --- FOOTER ---
    const renderFooter = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
                {isEditMode && (
                    <Button 
                        danger 
                        onClick={handleDelete} 
                        icon={<DeleteOutlined />}
                    >
                        Hapus
                    </Button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={onCancel} disabled={loading}>Batal</Button>
                <Button 
                    type="primary" 
                    onClick={() => form.submit()} 
                    loading={loading} 
                    icon={<SaveOutlined />}
                >
                    {isEditMode ? 'Simpan' : 'Simpan Data'}
                </Button>
            </div>
        </div>
    );

    return (
        <>
            {/* Wajib menyertakan contextHolder agar Modal.confirm muncul */}
            {contextHolder} 
            
            <Modal
                title={isEditMode ? `Edit Non-Faktur (${initialValues?.nomorInvoice})` : "Input Non-Faktur Baru"}
                open={open}
                onCancel={onCancel}
                footer={renderFooter()} 
                destroyOnClose
                maskClosable={false}
                centered
            >
                <Form 
                    form={form} 
                    layout="vertical" 
                    onFinish={handleFinish}
                >
                    <Form.Item label="Tanggal" name="tanggal" rules={[{ required: true }]}>
                        <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="Nama Pelanggan" name="namaPelanggan" rules={[{ required: true }]}>
                        <Select showSearch placeholder="Pilih Pelanggan" optionFilterProp="children" loading={loadingPelanggan}>
                            <Option value="Umum">Umum</Option>
                            {pelangganList.map(p => <Option key={p.id} value={p.nama}>{p.nama}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Nominal (Rp)" name="jumlah" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} formatter={v => `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\Rp\s?|(,*)/g, '')} min={0} />
                    </Form.Item>
                    <Form.Item label="Keterangan" name="keterangan">
                        <TextArea rows={3} placeholder="Contoh: NITIP" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default NonFakturForm;